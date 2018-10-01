const express = require('express');
const fetch = require('node-fetch');
const querystring = require('querystring');
const moment = require('moment');

const port = 3000;
const stUrl = process.env.ST_URL;

const app = express();

app.get('*', async (req, res) => {
	// Update wunderground
	try {
		const data = req.query;
		data.dateutc = moment.utc().format('YYYY-MM-DD HH:mm:ss');
		const wuUrl = `http://${req.hostname}${req.path}?${querystring.stringify(
			data
		)}`;
		const wuResp = await fetch(wuUrl);

		const respBody = await wuResp.text();

		wuResp.headers.forEach((val, key) => {
			res.set(key, val);
		});
		res.send(respBody);

		if (wuResp.ok) {
			console.log('WU update success');
		} else {
			console.warn(`WU update error (${wuResp.status})`, respBody);
		}
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
