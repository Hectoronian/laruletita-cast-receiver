/**
 * La Ruletita Cast Receiver - Spin animation
 *
 * Turns a SPIN_START payload into rotationAt(elapsedMs), so the TV animates locally at the
 * display's frame rate. Three shapes, newest first:
 *
 *  - easing "decay" (app v3): the phone's friction physics, v(t) = v0·e^(−k·t), so the TV
 *    follows the exact same curve as the phone (SpinPlan.rotationAt in WheelMath.kt).
 *  - easing "easeOut" (app v3, Reduce motion): cubic ease-out over totalDurationMs.
 *  - no easing (app v2): a linear phase covering phase1Fraction of the distance over
 *    durationMs, then a cubic ease-out over phase2DurationMs.
 */

function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

function finiteOr(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? value : fallback;
}

function createSpinAnimation(payload, currentRotation) {
    const start = finiteOr(payload.startRotation, currentRotation);
    const target = finiteOr(payload.targetRotation, start);
    const distance = target - start;

    if (payload.easing === 'decay') {
        const v0 = finiteOr(payload.initialVelocity, 0);
        const k = finiteOr(payload.friction, 0);
        const total = finiteOr(payload.totalDurationMs, 0);
        if (v0 > 0 && k > 0 && total > 0) {
            const direction = distance < 0 ? -1 : 1;
            const span = Math.abs(distance);
            return {
                start,
                target,
                totalDurationMs: total,
                rotationAt(elapsed) {
                    if (elapsed >= total) return target;
                    if (elapsed <= 0) return start;
                    const travelled = (v0 / k) * (1 - Math.exp(-k * elapsed));
                    // Clamp so floating error never overshoots the planned stop
                    return start + direction * Math.min(travelled, span);
                }
            };
        }
    }

    if (payload.easing === 'easeOut') {
        const total = Math.max(1, finiteOr(payload.totalDurationMs, 450));
        return {
            start,
            target,
            totalDurationMs: total,
            rotationAt(elapsed) {
                if (elapsed >= total) return target;
                if (elapsed <= 0) return start;
                return start + distance * easeOutCubic(elapsed / total);
            }
        };
    }

    // v2: linear, then eased landing
    let phase1Ms = Math.max(0, finiteOr(payload.durationMs, 0));
    let fraction = Math.min(1, Math.max(0, finiteOr(payload.phase1Fraction, 0.7)));
    const phase2Ms = Math.max(1, finiteOr(payload.phase2DurationMs, 1500));
    // A linear phase with no time to run would jump; give its distance to the landing instead
    if (phase1Ms === 0) fraction = 0;
    if (fraction === 0) phase1Ms = 0;
    const phase1Distance = distance * fraction;
    const total = phase1Ms + phase2Ms;

    return {
        start,
        target,
        totalDurationMs: total,
        rotationAt(elapsed) {
            if (elapsed >= total) return target;
            if (elapsed <= 0) return start;
            if (elapsed < phase1Ms) return start + phase1Distance * (elapsed / phase1Ms);
            const t = (elapsed - phase1Ms) / phase2Ms;
            return start + phase1Distance + (distance - phase1Distance) * easeOutCubic(t);
        }
    };
}

if (typeof module !== 'undefined') module.exports = { createSpinAnimation };
