// Checks js/spin-animation.js against the app's physics. Run: node dev/spin-animation.test.js
const assert = require('assert');
const { createSpinAnimation } = require('../js/spin-animation.js');

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const STOP = 0.004;

// v3 decay: the same formula as SpinPlan.rotationAt in WheelMath.kt
{
    const v0 = 2.4;
    const k = Math.log(v0 / STOP) / 3000;
    const distance = (v0 - STOP) / k;
    const total = Math.round(Math.log(v0 / STOP) / k);
    const anim = createSpinAnimation({
        startRotation: -90, targetRotation: -90 + distance, easing: 'decay',
        initialVelocity: v0, friction: k, totalDurationMs: total
    }, 0);
    close(anim.rotationAt(0), -90);
    for (const t of [16, 250, 1000, 2000, 2900]) {
        close(anim.rotationAt(t), -90 + Math.min((v0 / k) * (1 - Math.exp(-k * t)), distance));
    }
    close(anim.rotationAt(total), -90 + distance);
    close(anim.rotationAt(total + 500), -90 + distance);
    // Speed at the start matches the flick (°/ms) and fades to almost nothing at the end
    close(anim.rotationAt(1) - anim.rotationAt(0), v0, 0.01);
    assert.ok(anim.rotationAt(total - 1) - anim.rotationAt(total - 2) < 0.01);
    // Never moves backwards
    let prev = -Infinity;
    for (let t = 0; t <= total; t += 7) { const r = anim.rotationAt(t); assert.ok(r >= prev); prev = r; }
}

// Counter-clockwise flick
{
    const v0 = 1.5, k = 0.0016, distance = (v0 - STOP) / k;
    const total = Math.round(Math.log(v0 / STOP) / k);
    const anim = createSpinAnimation({
        startRotation: 30, targetRotation: 30 - distance, easing: 'decay',
        initialVelocity: v0, friction: k, totalDurationMs: total
    }, 0);
    assert.ok(anim.rotationAt(500) < 30);
    close(anim.rotationAt(total), 30 - distance);
}

// v3 Reduce motion
{
    const anim = createSpinAnimation({ startRotation: 0, targetRotation: 100, easing: 'easeOut', totalDurationMs: 450 }, 0);
    assert.strictEqual(anim.totalDurationMs, 450);
    close(anim.rotationAt(225), 100 * (1 - Math.pow(0.5, 3)));
    close(anim.rotationAt(450), 100);
}

// v2 payload: linear 70% over durationMs, then 30% eased over phase2DurationMs
{
    const anim = createSpinAnimation({ startRotation: 0, targetRotation: 1000, durationMs: 2000, phase1Fraction: 0.7, phase2DurationMs: 1500 }, 999);
    assert.strictEqual(anim.totalDurationMs, 3500);
    close(anim.rotationAt(1000), 350);
    close(anim.rotationAt(2000), 700);
    close(anim.rotationAt(3500), 1000);
}

// v2 build that sent no fraction or phase 2: old receiver defaults
{
    const anim = createSpinAnimation({ startRotation: 0, targetRotation: 1000, durationMs: 2000 }, 0);
    assert.strictEqual(anim.totalDurationMs, 3500);
    close(anim.rotationAt(2000), 700);
}

// The bug this replaces: v3 sent durationMs 0, and the old receiver jumped 70% at once
{
    const anim = createSpinAnimation({ startRotation: 0, targetRotation: 1000, durationMs: 0, phase1Fraction: 0, phase2DurationMs: 4000 }, 0);
    assert.ok(anim.rotationAt(16) < 50, 'no jump on the first frame');
    close(anim.rotationAt(4000), 1000);
}

// Missing startRotation falls back to where the wheel is
{
    const anim = createSpinAnimation({ targetRotation: 500, durationMs: 1000, phase1Fraction: 0.5, phase2DurationMs: 1000 }, 120);
    close(anim.rotationAt(0), 120);
}

console.log('spin-animation: all checks passed');
