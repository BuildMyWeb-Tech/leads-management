const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name:  { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: {
      type: String,
      // PHASE B: 'tl' added as a NEW role (not a rename of
      // 'director' — no existing users are migrated to it). Intended
      // future hierarchy: admin -> director -> tl -> telecaller.
      enum: ['admin', 'director', 'tl', 'telecaller'],
      default: 'telecaller',
    },
    isActive: { type: Boolean, default: true },

    // PHASE B — TL-ready hierarchy scaffold only. Optional/nullable
    // so all existing admin/director/telecaller users remain valid
    // untouched. No permissions/dashboard logic reads this yet.
    // Intended future use: tl.managedBy = director._id,
    // telecaller.managedBy = tl._id.
    managedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // PHASE 9 — per-user notification preferences
    notificationPrefs: {
      leadAssigned:    { type: Boolean, default: true  },  // director: new lead allocated to me
      telecallerAssigned: { type: Boolean, default: true }, // telecaller: lead assigned to me
      followUpReminder: { type: Boolean, default: true  },  // all: follow-up due today
      statusChanged:   { type: Boolean, default: false  },  // admin/director: status updates
      dailySummary:    { type: Boolean, default: false  },  // daily digest (future)
    },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.matchPassword = async function (entered) {
  return bcrypt.compare(entered, this.password);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

// PHASE B — supports future "TL's team" / "director's TLs" lookups.
userSchema.index({ managedBy: 1 });

module.exports = mongoose.model('User', userSchema);
