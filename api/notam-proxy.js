// Vercel Serverless Function - NOTAM Proxy
// This bypasses CORS by fetching from server-side

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { source, stations } = req.query;

    try {
        let data = null;

        if (source === 'navcanada') {
            // Nav Canada wxrecall
            const body = new URLSearchParams({
                'notam_locations': stations,
                'notam_type': 'location'
            });

            const response = await fetch('https://plan.navcanada.ca/wxrecall/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString()
            });

            data = await response.text();
        }
        else if (source === 'awc-xml') {
            // Aviation Weather Center XML
            const response = await fetch(
                `https://aviationweather.gov/adds/dataserver_current/httpparam?dataSource=notams&requestType=retrieve&format=xml&stationString=${stations}`
            );
            data = await response.text();
        }
        else if (source === 'faa') {
            // FAA NOTAM API
            const response = await fetch(
                `https://external-api.faa.gov/notamapi/v1/notams?icaoLocation=${stations}`
            );
            data = await response.json();
        }
        else if (source === 'pilotweb') {
            // PilotWeb
            const stArray = stations.split(',');
            const response = await fetch(
                `https://pilotweb.nas.faa.gov/PilotWeb/notamRetrievalByICAOAction.do?method=displayByICAOs&reportType=RAW&retrieveLocId=${stArray.join('+')}&actionType=notamRetrievalByICAOs`
            );
            data = await response.text();
        }
        else if (source === 'notamca') {
            // NOTAM.ca API
            const { lat, lon } = req.query;
            const response = await fetch(
                `https://notam.ca/api/v1/notams?point=${lon},${lat}&radius=25`
            );
            data = await response.json();
        }

        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Proxy error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
