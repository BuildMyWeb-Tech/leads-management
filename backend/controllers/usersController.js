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
    const { name, email, role, isActive, managedBy } = req.body;
    const update = { name, email, role, isActive };
    // PHASE C: only touch managedBy when explicitly provided, so
    // existing update calls that don't send it never accidentally
    // clear an existing hierarchy link.
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

module.exports = { getUsers, createUser, updateUser };
