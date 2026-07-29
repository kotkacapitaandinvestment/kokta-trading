import { Router } from 'express';
import { asyncHandler } from './asyncHandler.js';

export function createCrudRouter(model, { orderBy = { createdAt: 'desc' } } = {}) {
  const router = Router();

  router.get('/', asyncHandler(async (req, res) => {
    const items = await model.findMany({ orderBy });
    res.json({ items });
  }));

  router.post('/', asyncHandler(async (req, res) => {
    const item = await model.create({ data: req.body ?? {} });
    res.status(201).json({ item });
  }));

  router.patch('/:id', asyncHandler(async (req, res) => {
    const item = await model.update({ where: { id: req.params.id }, data: req.body ?? {} });
    res.json({ item });
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    await model.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }));

  return router;
}
