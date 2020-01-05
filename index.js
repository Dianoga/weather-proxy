const express = require('express');
const fetch = require('node-fetch');
const querystring = require('querystring');
const moment = require('moment');
const Feels = require('feels');

const port = 3000;
const stUrl = process.env.ST_URL;
const debug = !!process.env.DEBUG;

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

	if (parseFloat(data.tempf) < -100 || parseFloat(data.windspeedmph) < 0) {
		console.debug('Bad data');
		return;
	}

	if (data.tempf < 32) {
		// Have to manually calculate the windchill as ObserverIP is unreliable when it's below -40
		const feels = new Feels();
		feels.setOptions({
			temp: parseFloat(data.tempf),
			humidity: parseFloat(data.humidity),
			speed: parseFloat(data.windspeedmph),
			units: { speed: 'mph', temp: 'f' }
		});

		const newWindChill = feels.windChill();
		data.windchillf = Math.round(newWindChill * 100) / 100; // This is imperfect, but good enough for rounding to 2 decimals
	}

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
		if (debug) console.debug(JSON.stringify(req.query));
		console.log('ST update success');
	} catch (e) {
		console.error('ST Update failed', e);
	}
});

app.listen(port, () => console.log(`Proxy listening on port ${port}!`));
