const express = require('express');
const router = express.Router();
const { getUsers, createUser, updateUser, deleteUser } = require('../controllers/usersController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

// GET /api/users — Admin sees all; Director sees only telecallers; TL sees own employees (scoped in controller)
router.get('/', authorize('admin', 'director', 'tl'), getUsers);

// POST /api/users — Admin can create any role; TL can only create telecaller under themselves (enforced in controller)
router.post('/', authorize('admin', 'tl'), createUser);

// PUT /api/users/:id — Admin only
router.put('/:id', authorize('admin'), updateUser);

// DELETE /api/users/:id — Admin only (soft delete: sets isActive=false)
router.delete('/:id', authorize('admin'), deleteUser);

module.exports = router;
