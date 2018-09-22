const express = require('express');
const fetch = require('node-fetch');

const port = 3000;
const stUrl = process.env.ST_URL;

const app = express();

app.get('*', async (req, res) => {
	// Update wunderground
	try {
		const wuUrl = `http://${req.hostname}${req.url}`;
		const wuResp = await fetch(wuUrl);
		console.log('WU update success');
	} catch (e) {
		console.error('WU Update failed', e);
	}

	// ST Update
	try {
		delete req.query.PASSWORD;
		console.log(req.query);
		const stResp = await fetch(stUrl, {
			method: 'POST',
			body: JSON.stringify(req.query)
		});
		console.log('ST update success');
	} catch (e) {
		console.error('ST Update failed', e);
	}
});

app.listen(port, () => console.log(`Proxy listening on port ${port}!`));
