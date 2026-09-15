const User  = require('../models/User');
const audit = require('../utils/auditService');   // PHASE 10

const getUsers = async (req, res) => {
  try {
    const { role } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (req.user.role === 'director') filter.role = 'telecaller';
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

    const resolvedRole = (req.user.role === 'tl') ? 'telecaller' : (role || 'telecaller');

    // K2: Validate managedBy when provided — must point to an actual TL
    let resolvedManagedBy = managedBy || null;
    if (req.user.role === 'tl') {
      // TL always owns their created employees
      resolvedManagedBy = req.user._id;
    } else if (resolvedManagedBy) {
      // Admin: validate the specified manager is a TL
      const manager = await User.findById(resolvedManagedBy).select('role');
      if (!manager || manager.role !== 'tl') {
        return res.status(400).json({ message: 'managedBy must reference a Team Lead user' });
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

    // Restrict role changes to safe values — admin/director cannot be set via this endpoint
    const ALLOWED_ROLES = ['tl', 'telecaller'];
    if (role && !ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ message: 'Role must be tl or telecaller' });
    }

    // Validate managedBy when provided: must point to an actual TL
    if (managedBy) {
      const manager = await User.findById(managedBy).select('role');
      if (!manager || manager.role !== 'tl') {
        return res.status(400).json({ message: 'managedBy must reference a Team Lead user' });
      }
    }

    const update = {};
    if (name  !== undefined) update.name  = name;
    if (email !== undefined) update.email = email;
    if (role  !== undefined) update.role  = role;
    if (isActive !== undefined) update.isActive = isActive;
    // Clear managedBy when role changes to tl (TLs have no direct manager in this direction)
    if (role === 'tl') update.managedBy = null;
    else if (managedBy !== undefined) update.managedBy = managedBy || null;

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

module.exports = { getUsers, createUser, updateUser };
