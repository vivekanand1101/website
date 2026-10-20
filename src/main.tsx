import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
// After index.css so the shared palette and links win over Tailwind's reset.
import '../shared/site.css'

createRoot(document.getElementById("root")!).render(<App />);
