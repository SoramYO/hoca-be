const logger = async (app) => {
    app.addHook('onRequest', async (req) => {
        req.startTime = Date.now();
        console.log(`[REQUEST] ${req.method} ${req.url}`);
    });

    app.addHook('onSend', async (req, reply, payload) => {
        const duration = Date.now() - req.startTime;
        const statusCode = reply.statusCode;

        console.log(`[RESPONSE] ${req.method} ${req.url} - ${statusCode} (${duration}ms)`);

        if (statusCode >= 400) {
            try {
                // Try to parse if it's a JSON string
                const error = typeof payload === 'string' ? JSON.parse(payload) : payload;
                console.log(`[ERROR] ${JSON.stringify(error)}`);
            } catch (e) {
                console.log(`[ERROR] ${payload}`);
            }
        }

        return payload;
    });
};

module.exports = logger;