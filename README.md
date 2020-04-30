# weather-proxy

![Docker Build Status](https://img.shields.io/docker/build/dianoga/weather-proxy)

Use your local weather station to update SmartThings (or any GET endpoint).

This works in one of two ways

-   Push - Somehow your weather station is pointed at this running script. I'm using a local DNS server to overwrite rtupdate.wunderground.com
-   Poll - Scrape the livedata page on an ObserverIP module

## Environment Variables

-   RUN_METHOD: push|poll,
-   ST_URL: <url to update>,
-   WUNDERGROUND_STATION: Station ID,
-   WUNDERGROUND_PASSWORD: Password,
-   PORT: 80 - You have to use 80 if you're using the DNS rewrite method. Only used for push method
-   OBSERVER_URL: http://<observerIP>/livedata.htm,
-   INTERVAL: 15,
-   DEBUG: 1
