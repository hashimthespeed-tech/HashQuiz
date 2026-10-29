import { Router } from 'express';
import bcrypt from 'bcrypt';
import { fail, text } from './errors.js';

const dummyHash = await bcrypt.hash('not-an-account-password', 12);
export function password(value) {
  if (typeof value !== 'string' || value.length < 10 || Buffer.byteLength(value) > 72) {
    fail(400, 'Password must have at least 10 characters and no more than 72 bytes.');
  }
  return value;
}
export const publicUser = ({ id, username, email, role }) => ({ id, username, email, role });
export const requireAuth = (req, res, next) => req.user ? next() : fail(401, 'Please log in to continue.');
export const requireAdmin = (req, res, next) => {
  requireAuth(req, res, () => req.user.role === 'admin' ? next() : fail(403, 'Admin access is required.'));
};

async function establishSession(req, user) {
  await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
  req.session.userId = user.id;
  await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
}

export function authRouter(pool) {
  const router = Router();
  router.get('/me', (req, res) => res.json({ user: req.user || null }));
  router.post('/register', async (req, res) => {
    const username = text(req.body.username, 'Username', 30, 3);
    if (!/^[A-Za-z0-9_-]+$/.test(username)) fail(400, 'Use letters, numbers, underscores, or hyphens in your username.');
    const email = text(req.body.email, 'Email', 100).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address.');
    if ('role' in req.body) fail(400, 'Registration creates player accounts only.');
    const hash = await bcrypt.hash(password(req.body.password), 12);
    let user;
    try {
      ({ rows: [user] } = await pool.query('INSERT INTO users (username,email,password_hash) VALUES ($1,$2,$3) RETURNING id,username,email,role', [username, email, hash]));
    } catch (error) {
      if (error.code === '23505') fail(409, 'That username or email is already registered.');
      throw error;
    }
    await establishSession(req, user);
    res.status(201).json(publicUser(user));
  });
  router.post('/login', async (req, res) => {
    const username = text(req.body.username, 'Username', 30, 3);
    const suppliedPassword = password(req.body.password);
    const { rows: [user] } = await pool.query('SELECT * FROM users WHERE lower(username)=lower($1)', [username]);
    const matches = await bcrypt.compare(suppliedPassword, user?.password_hash || dummyHash);
    if (!user || !matches) fail(401, 'Username or password is incorrect.');
    await establishSession(req, user);
    res.json(publicUser(user));
  });
  router.post('/logout', requireAuth, async (req, res) => {
    await new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
    res.clearCookie('hosh.sid', { path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    res.json({ message: 'Logged out' });
  });
  return router;
}
