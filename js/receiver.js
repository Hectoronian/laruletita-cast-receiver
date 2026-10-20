/**
 * La Ruletita Cast Receiver
 * Handles Cast SDK initialization, message routing, and the spin state machine.
 *
 * Works with app v2 and v3 senders: every v3 field is optional and falls back to v2 behaviour.
 * Open index.html?dev to run without a Cast device (see dev/harness.js).
 */

const NAMESPACE = 'urn:x-cast:com.xeroxislabz.laruletita';
const DEV_MODE = new URLSearchParams(window.location.search).has('dev');

const State = {
    WAITING: 'WAITING',
    IDLE: 'IDLE',
    SPINNING: 'SPINNING',
    SHOWING_WINNER: 'SHOWING_WINNER'
};

class LaRuletitaReceiver {
    constructor() {
        this.state = State.WAITING;
        this.canvas = document.getElementById('wheel-canvas');
        this.wheelName = document.getElementById('wheel-name');
        this.statusText = document.getElementById('status-text');
        this.resultCard = document.getElementById('result');
        this.winnerLabel = document.getElementById('winner-label');

        this.renderer = new WheelRenderer(this.canvas);
        this.animationId = null;
        this.spin = null;
        this.spinStartedAt = 0;
        this.weighted = null;
        this.highlightWinner = true;

        this.setupCanvas();
        window.addEventListener('resize', () => {
            this.setupCanvas();
            this.fitWinnerLabel();
        });
        // Labels are measured on the canvas, so redraw once the web font is in
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.renderer.render());

        if (DEV_MODE) {
            console.log('Dev mode: Cast SDK not started');
        } else {
            this.initCastReceiver();
        }
    }

    setupCanvas() {
        this.renderer.resize();
        this.renderer.render();
    }

    initCastReceiver() {
        const context = cast.framework.CastReceiverContext.getInstance();

        context.addCustomMessageListener(NAMESPACE, (event) => {
            this.handleMessage(event.data);
        });

        const options = new cast.framework.CastReceiverOptions();
        options.disableIdleTimeout = true;
        context.start(options);

        setTimeout(() => {
            this.sendMessage({ type: 'RECEIVER_READY', payload: {} });
        }, 500);
    }

    sendMessage(message) {
        if (DEV_MODE) return;
        try {
            const context = cast.framework.CastReceiverContext.getInstance();
            context.sendCustomMessage(NAMESPACE, undefined, message);
        } catch (e) {
            console.error('Failed to send message:', e);
        }
    }

    handleMessage(data) {
        let msg;
        if (typeof data === 'string') {
            try { msg = JSON.parse(data); } catch (e) {
                console.error('Invalid JSON message:', data);
                return;
            }
        } else {
            msg = data;
        }
        if (!msg || typeof msg !== 'object') return;
        const payload = msg.payload || {};

        switch (msg.type) {
            case 'WHEEL_STATE':
                this.handleWheelState(payload);
                break;
            case 'SPIN_START':
                this.handleSpinStart(payload);
                break;
            case 'ROTATION_UPDATE':
                // Sent by early v2 builds; the local animation already covers it
                break;
            case 'SPIN_END':
                this.handleSpinEnd(payload);
                break;
            case 'WINNER_DISMISS':
                this.handleWinnerDismiss();
                break;
        }
    }

    handleWheelState(payload) {
        const spinning = this.state === State.SPINNING;
        // Don't jump the wheel mid-spin; the spin owns the rotation until it ends
        const update = Object.assign({}, payload);
        if (spinning) delete update.rotation;
        this.renderer.updateState(update);

        // v2 phones don't send a name; the title then shows the app name instead of the brand line
        const named = typeof payload.wheelName === 'string' && payload.wheelName.trim() !== '';
        this.wheelName.textContent = named ? payload.wheelName.trim() : 'La Ruletita';
        document.body.classList.toggle('unnamed', !named);
        this.weighted = typeof payload.weighted === 'boolean' ? payload.weighted : null;
        if (typeof payload.highlightWinner === 'boolean') this.highlightWinner = payload.highlightWinner;

        if (this.state === State.WAITING) this.state = State.IDLE;
        if (this.state !== State.SPINNING && this.state !== State.SHOWING_WINNER) this.showStatus(this.optionsSummary());
        if (!spinning) this.renderer.render();
    }

    optionsSummary() {
        const n = this.renderer.items.length;
        if (n === 0) return 'Add options on your phone';
        const count = n === 1 ? '1 option' : `${n} options`;
        if (this.weighted === null) return count;
        return `${count} · ${this.weighted ? 'Custom weights' : 'Equal chances'}`;
    }

    handleSpinStart(payload) {
        this.stopAnimation();
        this.hideResult();
        this.renderer.setHighlight(null);
        this.state = State.SPINNING;
        this.showStatus('Spinning…');

        this.spin = createSpinAnimation(payload, this.renderer.rotation);
        this.spinStartedAt = performance.now();
        this.animate();
    }

    animate() {
        const spin = this.spin;
        if (!spin) return;
        const elapsed = performance.now() - this.spinStartedAt;
        this.renderer.setRotation(spin.rotationAt(elapsed));
        this.renderer.render();
        if (elapsed >= spin.totalDurationMs) {
            // Hold the final angle until SPIN_END confirms the winner
            this.spin = null;
            this.animationId = null;
            return;
        }
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    stopAnimation() {
        if (this.animationId) cancelAnimationFrame(this.animationId);
        this.animationId = null;
        this.spin = null;
    }

    handleSpinEnd(payload) {
        this.stopAnimation();
        if (typeof payload.finalRotation === 'number' && isFinite(payload.finalRotation)) {
            this.renderer.setRotation(payload.finalRotation);
        }
        this.renderer.setHighlight(this.highlightWinner ? payload.winnerIndex : null);
        this.renderer.render();

        this.state = State.SHOWING_WINNER;
        this.showResult(payload.winnerLabel);
    }

    handleWinnerDismiss() {
        if (this.state === State.SPINNING) return;
        this.hideResult();
        this.renderer.setHighlight(null);
        this.renderer.render();
        this.state = this.renderer.items.length > 0 ? State.IDLE : State.WAITING;
        this.showStatus(this.optionsSummary());
    }

    showStatus(text) {
        this.statusText.textContent = text;
        this.statusText.hidden = false;
    }

    showResult(label) {
        this.winnerLabel.textContent = label == null ? '' : String(label);
        this.statusText.hidden = true;
        this.resultCard.hidden = false;
        // Restart the entrance animation for back-to-back results
        this.resultCard.classList.remove('visible');
        void this.resultCard.offsetWidth;
        this.resultCard.classList.add('visible');
        this.fitWinnerLabel();
    }

    hideResult() {
        this.resultCard.classList.remove('visible');
        this.resultCard.hidden = true;
        this.statusText.hidden = false;
    }

    /** Shrinks long winners until they fit in three lines. */
    fitWinnerLabel() {
        if (this.resultCard.hidden) return;
        const el = this.winnerLabel;
        el.style.fontSize = '';
        let size = parseFloat(getComputedStyle(el).fontSize);
        const lineHeight = 1.08;
        const min = size * 0.4;
        while (size > min && el.scrollHeight > size * lineHeight * 3 + 1) {
            size *= 0.9;
            el.style.fontSize = `${size}px`;
        }
    }
}

window.addEventListener('load', () => {
    window.receiver = new LaRuletitaReceiver();
    if (DEV_MODE) {
        const script = document.createElement('script');
        script.src = 'dev/harness.js';
        document.body.appendChild(script);
    }
});
