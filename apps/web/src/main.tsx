import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { RouterProvider, createBrowserRouter } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from './queries';

const root = document.getElementById('root');
if (!root) throw new Error('Application root element is missing.');

const router = createBrowserRouter([{ path: '*', element: <App /> }]);
const queryClient = createQueryClient();
createRoot(root).render(<StrictMode><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></StrictMode>);
