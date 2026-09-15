/**
 * phaseQ2.auditLogIndexes.test.js — AuditLog model/index verification.
 *
 * Q.1 noted AuditLog indexes were not verified.
 * This test confirms the expected indexes are declared and adequate.
 * No new indexes are added — existing ones are sufficient.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');

test('Q2-AL-01: AuditLog has compound index on actor._id + createdAt', () => {
  const AuditLog = require('../models/AuditLog');
  const indexes  = AuditLog.schema.indexes();
  const found = indexes.find(([fields]) =>
    fields['actor._id'] === 1 && fields.createdAt === -1
  );
  assert.ok(found, 'compound index {actor._id:1, createdAt:-1} must exist');
});

test('Q2-AL-02: AuditLog has compound index on target._id + createdAt', () => {
  const AuditLog = require('../models/AuditLog');
  const indexes  = AuditLog.schema.indexes();
  const found = indexes.find(([fields]) =>
    fields['target._id'] === 1 && fields.createdAt === -1
  );
  assert.ok(found, 'compound index {target._id:1, createdAt:-1} must exist');
});

test('Q2-AL-03: AuditLog has compound index on action + createdAt', () => {
  const AuditLog = require('../models/AuditLog');
  const indexes  = AuditLog.schema.indexes();
  const found = indexes.find(([fields]) =>
    fields.action === 1 && fields.createdAt === -1
  );
  assert.ok(found, 'compound index {action:1, createdAt:-1} must exist');
});

test('Q2-AL-04: AuditLog has TTL index on createdAt (365 days)', () => {
  const AuditLog = require('../models/AuditLog');
  const indexes  = AuditLog.schema.indexes();
  const ttlIdx   = indexes.find(([fields, opts]) =>
    fields.createdAt === 1 && opts.expireAfterSeconds === 365 * 24 * 60 * 60
  );
  assert.ok(ttlIdx, 'TTL index expireAfterSeconds=31536000 must exist on createdAt');
});

test('Q2-AL-05: AuditLog versionKey is disabled (immutable documents)', () => {
  const AuditLog = require('../models/AuditLog');
  // versionKey: false means no __v field — logs are write-once
  assert.equal(AuditLog.schema.get('versionKey'), false,
    'versionKey must be disabled for immutable audit log');
});

test('Q2-AL-06: AuditLog action enum includes attendance_marked', () => {
  const AuditLog   = require('../models/AuditLog');
  const actionEnum = AuditLog.schema.paths.action.enumValues;
  assert.ok(actionEnum.includes('attendance_marked'),
    'attendance_marked must be in AuditLog action enum after Q2-007');
});
