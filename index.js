const express = require('express');
const fetch = require('node-fetch');
const querystring = require('querystring');
const moment = require('moment');

const port = 3000;
const stUrl = process.env.ST_URL;

const app = express();

let oldData = {};

function isDifferent(oldData, newData, skipKeys = ['dateutc']) {
	return !Object.keys(newData).every(key => {
		if (skipKeys.includes(key)) return true;

		return oldData[key] && oldData[key] === newData[key];
	});
}

app.get('*', async (req, res) => {
	const data = req.query;

	// Check if the data has changed. If not, don't send an update
	if (!isDifferent(oldData, data)) {
		console.debug('Nothing changed');
		return;
	}

	oldData = { ...data };

	// Update wunderground
	try {
		data.dateutc = moment.utc().format('YYYY-MM-DD HH:mm:ss');
		const wuUrl = `http://${req.hostname}${
			req.path
		}?${querystring.stringify(data)}`;
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