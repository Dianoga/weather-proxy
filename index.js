const fetch = require('node-fetch');
const cheerio = require('cheerio');
const querystring = require('querystring');
const moment = require('moment');
const Feels = require('feels');

const stationUrl = 'http://10.0.1.5/livedata.htm';
const stUrl = process.env.ST_URL;
const wundergroundStation = process.env.WUNDERGROUND_STATION;
const wundergroundPassword = process.env.WUNDERGROUND_PASSWORD;
const wundergroundUpdateUrl =
	'http://rtupdate.wunderground.com/weatherstation/updateweatherstation.php';

const interval = (parseInt(process.env.INTERVAL, 10) || 60) * 1000;
const debug = !!process.env.DEBUG;

let oldData = {};

function isDifferent(oldData, newData, skipKeys = ['dateutc']) {
	return !Object.keys(newData).every(key => {
		if (skipKeys.includes(key)) return true;

		return oldData[key] && oldData[key] === newData[key];
	});
}

const valToNumber = val => {
	const parsed = parseFloat(val);

	if (parsed === NaN) return null;
	return parsed;
};

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
		baromin: valToNumber($('[name=AbsPress]').val())
	};

	return data;
};

const updateWunderground = async rawData => {
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

		if (wuResp.ok) {
			console.log('WU update success');
		} else {
			console.warn(`WU update error (${wuResp.status})`, respBody);
		}
	} catch (e) {
		console.error('WU Update failed', e);
	}
};

const updateSmartThings = async rawData => {
	const data = { ...rawData };

	try {
		const stResp = await fetch(stUrl, {
			method: 'POST',
			body: JSON.stringify(data)
		});
		if (debug) console.debug(JSON.stringify(data));
		console.log('ST update success');
	} catch (e) {
		console.error('ST Update failed', e);
	}
};

const handleData = async data => {
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

	await updateWunderground(data);
	await updateSmartThings(data);
};

const run = async () => {
	try {
		const data = await fetchFromStation();
		if (data) await handleData(data);
	} catch (e) {
		console.error(e);
	}

	setTimeout(run, interval);
};

run();
