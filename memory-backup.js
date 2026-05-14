#!/usr/bin/env node
const { backupMemory } = require('./memory-config');

try {
  console.log(JSON.stringify(backupMemory(), null, 2));
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
