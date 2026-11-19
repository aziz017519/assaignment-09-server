export function validate(schemas) {
    return (req, _res, next) => {
        try {
            if (schemas.body)
                req.body = schemas.body.parse(req.body);
            if (schemas.params) {
                Object.defineProperty(req, 'params', {
                    value: schemas.params.parse(req.params),
                    writable: true,
                    configurable: true,
                });
            }
            if (schemas.query) {
                // Express 5 exposes req.query as a getter; redefine it with the parsed value.
                Object.defineProperty(req, 'query', {
                    value: schemas.query.parse(req.query),
                    writable: true,
                    configurable: true,
                });
            }
            next();
        }
        catch (error) {
            next(error);
        }
    };
}
