import { config } from './config/index.mjs';
import connectDB from './db.mjs';
import { createApp } from './app.mjs';

// Connect first, then listen, so the server never accepts requests without a database.
try {
  await connectDB();
} catch (err) {
  console.error('MongoDB connection error:', err);
  process.exit(1);
}

createApp().listen(config.port, () => console.log(`Oyera Service Bay listening on http://localhost:${config.port}`));
