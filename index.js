const fetch = require('node-fetch');
const cheerio = require('cheerio');
const querystring = require('querystring');
const moment = require('moment');
const Feels = require('feels');

const stationUrl = process.env.OBSERVER_URL;
const stUrl = process.env.ST_URL;
const wundergroundStation = process.env.WUNDERGROUND_STATION;
const wundergroundPassword = process.env.WUNDERGROUND_PASSWORD;
const wundergroundUpdateUrl =
	'http://rtupdate.wunderground.com/weatherstation/updateweatherstation.php';

const interval = (parseInt(process.env.INTERVAL, 10) || 60) * 1000;
const debug = !!process.env.DEBUG;

let oldData = {};

function isDifferent(oldData, newData, skipKeys = ['dateutc']) {
	return !Object.keys(newData).every((key) => {
		if (skipKeys.includes(key)) return true;

		return oldData[key] && oldData[key] === newData[key];
	});
}

const valToNumber = (val) => {
	const parsed = parseFloat(val);

	if (parsed === NaN) return null;
	return parsed;
};

const date = () => new Date().toISOString();

const fetchFromStation = async () => {
	const resp = await fetch(stationUrl);
	const respData = await resp.text();

	const $ = cheerio.load(respData);

	const data = {
		humidity: valToNumber($('[name=outHumi]').val()),
		indoortempf: valToNumber($('[name=inTemp]').val()),
		indoorhumidity: valToNumber($('[name=inHumi]').val()),
		tempf: valToNumber($('[name=outTemp]').val()),
		winddir: valToNumber($('[name=windir]').val()),
		windspeedmph: valToNumber($('[name=avgwind]').val()),
		windgustmph: valToNumber($('[name=gustspeed]').val()),
		solarradiation: valToNumber($('[name=solarrad]').val()),
		UV: valToNumber($('[name=uv]').val()),
		rainin: valToNumber($('[name=rainofhourly]').val()),
		dailyrainin: valToNumber($('[name=rainofdaily]').val()),
		baromin: valToNumber($('[name=AbsPress]').val()),
	};

	return data;
};

const updateWunderground = async (rawData, res) => {
	const data = { ...rawData };

	data.action = 'updateraw';
	data.dateutc = moment.utc().format('YYYY-MM-DD HH:mm:ss');
	data.ID = wundergroundStation;
	data.PASSWORD = wundergroundPassword;
	data.realtime = 1;
	data.rtfreq = interval;

	// Update wunderground
	try {
		const wuUrl = `${wundergroundUpdateUrl}?${querystring.stringify(data)}`;
		const wuResp = await fetch(wuUrl);

		const respBody = await wuResp.text();

		if (res) {
			wuResp.headers.forEach((val, key) => {
				res.set(key, val);
			});
			res.send(respBody);
		}

		if (wuResp.ok) {
			console.log(`${date()}: WU update success`);
		} else {
			console.warn(
				`${date()}: WU update error (${wuResp.status})`,
				respBody
			);
		}
	} catch (e) {
		console.error(`${date()}: WU Update failed`, e);
	}
};

const updateSmartThings = async (rawData) => {
	const data = { ...rawData };

	try {
		delete data.PASSWORD;
		const stResp = await fetch(stUrl, {
			method: 'POST',
			body: JSON.stringify(data),
		});
		if (debug) console.debug(JSON.stringify(data));
		console.log(`${date()}: ST update success`);
	} catch (e) {
		console.error(`${date()}: ST Update failed`, e);
	}
};

const processData = async (data) => {
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
			units: { speed: 'mph', temp: 'f' },
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
	return data;
};

const run = async () => {
	try {
		console.log(`${date()}: Fetching latest data`);
		const data = await fetchFromStation();
		if (data) {
			const processedData = await processData(data);
			await updateWunderground(processedData);
			await updateSmartThings(processedData);
		}
	} catch (e) {
		console.error(e);
	} finally {
		setTimeout(run, interval);
	}
};

if (process.env.RUN_METHOD === 'push') {
	const express = require('express');
	const app = express();
	app.get('*', async (req, res) => {
		const data = { ...req.query };
		try {
			if (data) {
				const processedData = await processData(data);
				await updateWunderground(processedData, res);
				await updateSmartThings(processedData);
			}
		} catch (e) {
			console.error(e);
		}
	});

	app.listen(process.env.PORT);
} else if (process.env.RUN_METHOD === 'poll') {
	run();
} else {
	console.error(
		'No run method specified. RUN_METHOD must be either push or poll'
	);
}
