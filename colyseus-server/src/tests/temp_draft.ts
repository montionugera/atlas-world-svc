
import { describe, expect, test } from "@jest/globals"; // or 'bun:test' if that's what the project uses
import { mobFactory } from '../config/mobTypesConfig';
import { DoubleAttackStrategy } from '../ai/strategies/DoubleAttackStrategy';

// We need to check if the project uses jest or bun:test. 
// The previous error showed "Cannot find module 'bun:test'", suggesting the codebase might be migrating or mixed.
// I will check `package.json` again or check existing working tests.
// checking package.json... "test": "jest". 
// But the error logs showed imports from "bun:test" failing.
// Since the environment seems to be Node/Jest based on package.json, I'll use Jest.

describe('Double Attacker Config Verification', () => {
    test('should load Double Attacker with updated config values', () => {
        // Create a mob of type 'doubleAttacker'
        // We'll need to mock dependencies if mobFactory needs them, but let's see.
        // mobFactory.createMob('doubleAttacker', ...)
    });
});
