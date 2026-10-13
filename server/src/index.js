import { app } from './app.js';
import { serveClient } from './clientSite.js';

// Hosts that run Kotka as one server (Render) serve the website from here too.
if (process.env.SERVE_CLIENT === '1') serveClient(app);

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Kotka ${process.env.SERVE_CLIENT === '1' ? 'site and API' : 'API'} listening on port ${port}`));
