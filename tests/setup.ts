process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
process.env.DB_NAME = 'fixmate_test';
process.env.JWT_SECRET = 'test-jwt-secret-0123456789';
process.env.BETTER_AUTH_SECRET = 'test-better-auth-secret-0123456789';
process.env.CLIENT_URL = 'http://localhost:3000';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_key_for_tests';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy_secret_for_tests';
