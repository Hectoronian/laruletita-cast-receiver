/**
 * Dev harness: replays sender messages so the receiver can be checked in a desktop browser.
 * Loaded only with index.html?dev. Pick a scenario with &scenario=…:
 *
 *   waiting   nothing received yet
 *   ready     a v3 phone's wheel (default)
 *   spin      ready, then a v3 Spin-button spin
 *   result    ready, then a finished spin with the winner highlighted
 *   long      a long winner name
 *   many      24 options with long labels (thin slices)
 *   v2        a v2 phone: legacy palette, no wheel name, two-phase spin, then the result
 *   demo      loops spins forever
 *
 * &seed=N makes the spin repeatable.
 */
(function () {
    const params = new URLSearchParams(window.location.search);
    const scenario = params.get('scenario') || 'ready';
    let seed = Number(params.get('seed') || 7);
    const random = () => {
        // mulberry32
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const send = (type, payload) => window.receiver.handleMessage(JSON.stringify({ type, payload }));

    // The app's v3 Classic order
    const CLASSIC_V3 = ['#FFE66D', '#4ECDC4', '#FF8B94', '#95E1D3', '#FFAA85', '#9D84B7', '#A8E6CF', '#FF6B6B'];

    function wheelState(name, labels, extra) {
        return Object.assign({
            items: labels.map((label) => ({ label, weight: 1 })),
            colorStyle: 'Classic',
            textDisplayMode: 'Auto',
            textSize: 'Medium',
            rotation: -90,
            wheelName: name,
            weighted: false,
            highlightWinner: true,
            colors: labels.map((_, i) => CLASSIC_V3[i % CLASSIC_V3.length])
        }, extra || {});
    }

    // Mirrors SpinPhysics in the app's WheelMath.kt (Spin button, Equal chances)
    const STOP = 0.004;
    function buttonPlan(start, count, durationMs) {
        const v0 = 1.8 + random() * 1.2;
        const k = Math.log(v0 / STOP) / durationMs;
        const distance = (v0 - STOP) / k;
        const end = start + distance;
        const total = Math.round(Math.log(v0 / STOP) / k);
        const slice = 360 / count;
        const winner = Math.min(count - 1, Math.floor((((270 - end) % 360) + 360) % 360 / slice));
        return { start, end, v0, k, total, winner };
    }

    function spinV3(state, onDone) {
        const plan = buttonPlan(window.receiver.renderer.rotation, state.items.length, 3000);
        send('SPIN_START', {
            direction: 1,
            startRotation: plan.start,
            targetRotation: plan.end,
            durationMs: 0,
            phase1Fraction: 0,
            phase2DurationMs: plan.total,
            easing: 'decay',
            initialVelocity: plan.v0,
            friction: plan.k,
            totalDurationMs: plan.total
        });
        setTimeout(() => {
            send('SPIN_END', { winnerIndex: plan.winner, winnerLabel: state.items[plan.winner].label, finalRotation: plan.end });
            if (onDone) onDone();
        }, plan.total);
        return plan;
    }

    function finishInstantly(state) {
        const plan = buttonPlan(-90, state.items.length, 3000);
        send('SPIN_END', { winnerIndex: plan.winner, winnerLabel: state.items[plan.winner].label, finalRotation: plan.end });
    }

    const dinner = wheelState('Dinner choices', ['Pizza', 'Sushi', 'Tacos', 'Burgers']);

    switch (scenario) {
        case 'waiting':
            break;
        case 'ready':
            send('WHEEL_STATE', dinner);
            break;
        case 'spin':
            send('WHEEL_STATE', dinner);
            spinV3(dinner);
            break;
        case 'result':
            send('WHEEL_STATE', dinner);
            finishInstantly(dinner);
            break;
        case 'long': {
            const s = wheelState('Who presents first at the quarterly review', [
                'Alexandria Montgomery-Fitzgerald', 'Bruno', 'Camila Rodríguez de la Fuente', 'Dmitri'
            ], { weighted: true });
            send('WHEEL_STATE', s);
            send('SPIN_END', { winnerIndex: 0, winnerLabel: s.items[0].label, finalRotation: -90 - 45 });
            break;
        }
        case 'many': {
            const labels = Array.from({ length: 24 }, (_, i) => `Option number ${i + 1}`);
            send('WHEEL_STATE', wheelState('Numbers 1–24', labels, { textSize: 'Large' }));
            break;
        }
        case 'v2': {
            // A v2 phone: no colours, name, weighting or easing; legacy two-phase spin
            const items = ['Yes', 'No', 'Maybe'].map((label) => ({ label, weight: 1 }));
            send('WHEEL_STATE', { items, colorStyle: 'Classic', textDisplayMode: 'Full', textSize: 'Medium', rotation: 0 });
            const target = 0 + 360 * 5 + 75;
            send('SPIN_START', { direction: 1, durationMs: 1000, targetRotation: target, startRotation: 0, phase1Fraction: 0.7, phase2DurationMs: 1500 });
            setTimeout(() => {
                const winner = Math.floor((((270 - target) % 360) + 360) % 360 / 120);
                send('SPIN_END', { winnerIndex: winner, winnerLabel: items[winner].label, finalRotation: target });
            }, 2500);
            break;
        }
        case 'demo': {
            send('WHEEL_STATE', dinner);
            const loop = () => spinV3(dinner, () => setTimeout(() => {
                send('WINNER_DISMISS', {});
                setTimeout(loop, 800);
            }, 2500));
            setTimeout(loop, 800);
            break;
        }
    }
})();
