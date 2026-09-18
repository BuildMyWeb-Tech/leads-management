const User  = require('../models/User');
const audit = require('../utils/auditService');   // PHASE 10

const getUsers = async (req, res) => {
  try {
    const { role } = req.query;
    const filter = { isActive: { $ne: false } }; // hide soft-deleted users
    if (role) filter.role = role;
    if (req.user.role === 'director') {
      // Director sees their own TLs and the telecallers under those TLs
      const ownTLs = await User.find({ role: 'tl', managedBy: req.user._id, isActive: { $ne: false } }, '_id').lean();
      const tlIds = ownTLs.map((t) => t._id);
      delete filter.role;
      filter.$or = [
        { role: 'tl', managedBy: req.user._id },
        { role: 'telecaller', managedBy: { $in: tlIds } },
      ];
    }
    // K2: TL sees only employees managed by themselves
    if (req.user.role === 'tl') {
      filter.role = 'telecaller';
      filter.managedBy = req.user._id;
    }
    const users = await User.find(filter).select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const createUser = async (req, res) => {
  try {
    const { name, email, password, role, managedBy } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    // K2: TL can only create telecaller employees managed by themselves
    if (req.user.role === 'tl') {
      if (role && role !== 'telecaller') {
        return res.status(403).json({ message: 'Team Leads can only create Employee accounts' });
      }
    }
    // Director can create TL or telecaller within their own hierarchy
    if (req.user.role === 'director') {
      if (role && !['tl', 'telecaller'].includes(role)) {
        return res.status(403).json({ message: 'Directors can only create Team Lead or Employee accounts' });
      }
    }

    const resolvedRole = (req.user.role === 'tl') ? 'telecaller' : (role || 'telecaller');

    // Validate managedBy: role-aware.
    //   TL caller      → auto-set to self (TL owns their employees)
    //   Director caller creating TL → auto-set managedBy to self
    //   Director caller creating telecaller → managedBy must be one of their TLs
    //   Admin creating TL       → managedBy must be a Director (or omitted)
    //   Admin creating telecaller → managedBy must be a TL (or omitted)
    let resolvedManagedBy = managedBy || null;
    if (req.user.role === 'tl') {
      // TL always owns their created employees
      resolvedManagedBy = req.user._id;
    } else if (req.user.role === 'director') {
      if (resolvedRole === 'tl') {
        resolvedManagedBy = req.user._id;
      } else if (resolvedManagedBy) {
        // Must be a TL managed by this director
        const manager = await User.findById(resolvedManagedBy).select('role managedBy');
        if (!manager || manager.role !== 'tl' || String(manager.managedBy) !== String(req.user._id)) {
          return res.status(400).json({ message: 'Assigned Team Lead must belong to your hierarchy' });
        }
      }
    } else if (resolvedManagedBy) {
      const manager = await User.findById(resolvedManagedBy).select('role');
      if (!manager) {
        return res.status(400).json({ message: 'managedBy user not found' });
      }
      if (resolvedRole === 'tl') {
        // Creating a TL: their manager must be a Director
        if (manager.role !== 'director') {
          return res.status(400).json({ message: 'A Team Lead\'s manager must be a Director' });
        }
      } else {
        // Creating a telecaller: their manager must be a TL
        if (manager.role !== 'tl') {
          return res.status(400).json({ message: 'managedBy must reference a Team Lead user' });
        }
      }
    }

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ message: 'A user with this email already exists' });

    const user = await User.create({ name, email, password, role: resolvedRole, managedBy: resolvedManagedBy });
    res.status(201).json(user);
    audit.userCreated(req, user);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const updateUser = async (req, res) => {
  try {
    const { name, email, role, isActive, managedBy, password } = req.body;

    // If a new password is provided, update via save() to trigger bcrypt pre-save hook.
    // findByIdAndUpdate bypasses pre-save hooks and would store plaintext.
    if (password && password.trim()) {
      const userDoc = await User.findById(req.params.id);
      if (!userDoc) return res.status(404).json({ message: 'User not found' });
      userDoc.password = password.trim();
      await userDoc.save();
    }

    // Restrict role changes to safe values — admin cannot be set via this endpoint
    const ALLOWED_ROLES = ['tl', 'telecaller', 'director'];
    if (role && !ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ message: 'Role must be tl, telecaller, or director' });
    }

    // Validate managedBy based on the target role:
    //   - telecaller: managedBy must point to a TL
    //   - tl:         managedBy must be null or point to a Director
    //   - other roles not reachable here (blocked above)
    const effectiveRole = role || (await User.findById(req.params.id).select('role').lean())?.role;
    if (managedBy && effectiveRole !== 'director') {
      const manager = await User.findById(managedBy).select('role');
      if (effectiveRole === 'tl') {
        if (!manager || manager.role !== 'director') {
          return res.status(400).json({ message: 'A Team Lead\'s manager must be a Director' });
        }
      } else {
        if (!manager || manager.role !== 'tl') {
          return res.status(400).json({ message: 'managedBy must reference a Team Lead user' });
        }
      }
    }

    const update = {};
    if (name  !== undefined) update.name  = name;
    if (email !== undefined) update.email = email;
    if (role  !== undefined) update.role  = role;
    if (isActive !== undefined) update.isActive = isActive;
    // managedBy semantics by role:
    //   tl:         can be set to a Director ID (or null if unassigned)
    //   telecaller: can be set to a TL ID (or null)
    // We no longer auto-clear managedBy when role=tl — admins may set it via EditUserModal.
    if (managedBy !== undefined) update.managedBy = managedBy || null;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    ).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
    // Audit deactivation separately for visibility
    if (isActive === false) {
      audit.userDeactivated(req, user);
    } else {
      audit.userUpdated(req, user, { name, email, role, isActive, managedBy });
    }
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// S.3: Delete user — soft-delete only (isActive=false) to preserve data integrity.
// Hard deletion is not safe: Leads, Attendance, AuditLogs, and AllocationConfig
// all reference User _ids. Setting isActive=false hides the user from all active
// lists while keeping historical data intact.
// Guard: admin cannot delete themselves (would lock out the system).
const deleteUser = async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') {
      return res.status(403).json({ message: 'Admin accounts cannot be deleted' });
    }
    user.isActive = false;
    await user.save();
    res.json({ message: `${user.name} has been deleted` });
    audit.userDeactivated(req, user);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { getUsers, createUser, updateUser, deleteUser };
