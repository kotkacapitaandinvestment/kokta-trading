import { useEffect, useState } from 'react';
import { api } from './api';

export function useAdminCrud(endpoint) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get(endpoint)
      .then(({ items }) => setItems(items))
      .finally(() => setLoading(false));
  }, [endpoint]);

  const create = async (data) => {
    const { item } = await api.post(endpoint, data);
    setItems((prev) => [item, ...prev]);
    return item;
  };

  const update = async (id, data) => {
    const { item } = await api.patch(`${endpoint}/${id}`, data);
    setItems((prev) => prev.map((i) => (i.id === id ? item : i)));
    return item;
  };

  const remove = async (id) => {
    await api.delete(`${endpoint}/${id}`);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  return { items, loading, create, update, remove };
}
