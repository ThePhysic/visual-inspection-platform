import { render } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach } from 'vitest';
import App from '../App';
import { createQueryClient } from '../queries';

const clients: ReturnType<typeof createQueryClient>[] = [];
afterEach(() => { for (const client of clients) client.clear(); clients.length = 0; });
export function renderApp(path = '/') {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } });
  clients.push(client);
  const router = createMemoryRouter([{ path: '*', element: <App /> }], { initialEntries: [path] });
  return { client, router, ...render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>) };
}
