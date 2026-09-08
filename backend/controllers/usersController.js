const User  = require('../models/User');
const audit = require('../utils/auditService');   // PHASE 10

const getUsers = async (req, res) => {
  try {
    const { role } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (req.user.role === 'director') filter.role = 'telecaller';
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
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ message: 'A user with this email already exists' });
    // PHASE C: managedBy is optional — omitting it leaves existing
    // create-user behavior unchanged for admin/director/telecaller.
    const user = await User.create({ name, email, password, role: role || 'telecaller', managedBy: managedBy || null });
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
