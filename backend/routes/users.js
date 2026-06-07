const express = require('express');
const router = express.Router();
const { getUsers, createUser, updateUser } = require('../controllers/usersController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

// GET /api/users — Admin sees all; Director sees only telecallers (scoped in controller)
router.get('/', authorize('admin', 'director'), getUsers);

// POST /api/users — Admin only
router.post('/', authorize('admin'), createUser);

// PUT /api/users/:id — Admin only
router.put('/:id', authorize('admin'), updateUser);

module.exports = router;
