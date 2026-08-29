/** Parse, delegate, respond. One permission-gated endpoint, no request body or query to parse. */
export function createAnalyticsController(service) {
    return {
        async getDashboard(_req, res, next) {
            try {
                const data = await service.getDashboard();
                res.json({ success: true, data });
            }
            catch (err) {
                next(err);
            }
        },
    };
}
