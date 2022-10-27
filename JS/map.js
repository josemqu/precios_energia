console.log("script map.js");

const tile = `https://tile.openstreetmap.org/{z}/{x}/{y}.png`;
const tile2 = "http://{s}.tile.osm.org/{z}/{x}/{y}.png";
const colors = ["#008800", "#FFFF00", "#BB0000"];
const MAX_ZOOM = 17;
const MIN_MAX_COLLISION_THRESHOLD = 0.15;
const myCircleMarker = (lat_lng, weight) => {
	const color = gradient(weight, ...colors);
	return L.circleMarker(lat_lng, {
		renderer: myRenderer,
		color: color,
		fillOpacity: 0.75,
		stroke: false,
		bubblingMouseEvents: true,
	});
};
const myMap = new L.Map("myMap", {
	gestureHandling: true,
	fullscreenControl: {
		pseudoFullscreen: true, // if true, fullscreen to page width and height
	},
});
const tileLayerGroup = L.tileLayer(tile, {
	markerZoomAnimation: true,
	maxZoom: MAX_ZOOM,
	dragging: true,
	touchZoom: true,
	scrollWheelZoom: true,
	boxZoom: false,
	keyboard: true,
	zoomControl: true,
	doubleClickZoom: true,
	attributionControl: true,
	closePopupOnClick: false,
	trackResize: true,
	attribution:
		'&copy; <a href="http://openstreetmap' +
		'.org">OpenStreetMap</a> contributors',
});
let myRenderer = L.canvas({ padding: 0.5 });
let globalData2 = [];
let featureLayerGroup;
let quadtree = L.quadtree();

const bloc = document.getElementById("bloque");
navigator.geolocation.getCurrentPosition(showPosition);
function showPosition(position) {
	bloc.innerHTML =
		"Latitud: " +
		position.coords.latitude +
		"<br>Longitud: " +
		position.coords.longitude;
}

function plotMap(data) {
	const dataset = getGeoJsonObject(data);
	tileLayerGroup.addTo(myMap);
	featureLayerGroup = L.geoJSON(dataset, {
		onEachFeature: function (feature, layer) {
			quadtree.add(layer);
			// layer.on("mouseover", function (e) {
			// 	e.target.bringToFront();
			// });
		},
		attribution: `<a href="http://datos.energia.gob.ar/dataset/">Datos Argentina</a> - <a href="https://datos.gob.ar/dataset/energia-precios-surtidor---resolucion-3142016">Precios en surtidor - Res 314/2016</a> - Datos Abiertos del Gobierno de la República Argentina`,
		pointToLayer: function (feature, latLng) {
			return L.circleMarker(latLng, {
				renderer: myRenderer,
				color: feature.properties.backgroundColor,
				radius: 16,
				fillOpacity: 0.8,
				stroke: false,
				bubblingMouseEvents: true,
			}).addTo(myMap);
		},
		style: function (feature) {
			return { color: feature.properties.backgroundColor };
		},
	})
		.bindPopup((layer) => {
			const company = layer.feature.properties.empresabandera;
			const product = PRODUCT_DICT[layer.feature.properties.producto];
			const price = layer.feature.properties.precio;
			const month = layer.feature.properties.indice_tiempo;
			const zone = layer.feature.properties.region;
			const town = layer.feature.properties.localidad;
			const address = layer.feature.properties.direccion;
			const unit = product == "GNC" ? `$/m<sup>3</sup>` : `$/litro`;

			return `
			<div class="popupHeader" style="text-align:center"><b>${company}</b> (${product})</div>
			<table class="popup-table">
				<tr>
					<td style="text-align:left">Precio (${unit}):</td>
					<td style="text-align:right"><b>${price}</b></td>
				</tr>
				<tr>
					<td style="text-align:left">Vigencia:</td>
					<td style="text-align:right"><b>${month}</b></td>
				</tr>
				<tr>
					<td style="text-align:left">Región:</td>
					<td style="text-align:right"><b>${zone ? zone : "-"}</b></td>
				</tr>
				<tr>
					<td style="text-align:left">Localidad:</td>
					<td style="text-align:right"><b>${town}</b></td>
				</tr>
				<tr>
					<td style="text-align:left">Dirección:</td>
					<td style="text-align:right"><b>${address}</b></td>
				</tr>
			</table>
		`;
		})
		// .bindTooltip((layer) => layer.feature.properties.empresabandera, {
		// 	permanent: false,
		// 	direction: "center",
		// 	className: "my-labels",
		// })
		.addTo(myMap);
	L.control
		.locate({
			locateOptions: {
				// setView: true,
				watch: true,
				layer: tileLayerGroup,
				maxZoom: MAX_ZOOM,
				enableHighAccuracy: true,
			},
		})
		.addTo(myMap);
	myMap.fitBounds(featureLayerGroup.getBounds());
	updateScale();
}
function getVisibleMarkers() {
	let bounds = myMap.getBounds();
	let colliders = quadtree.getColliders(bounds);
	let data = [];
	for (var i = 0, len = colliders.length; i < len; ++i) {
		data.push(colliders[i]);
	}
	return data;
}

//events definition
$("#mapModal").on("show.bs.modal", function () {
	setTimeout(function () {
		myMap.invalidateSize();
		quadtree = L.quadtree();
		const filteredData = getFilteredDataFromTable();
		dataWithValidLocations = filterDataWithLocations(filteredData);
		let dataWithoutOutliers = removeOutliers(dataWithValidLocations);
		Storage.save(dataWithoutOutliers, "dataWithoutOutliers");
		console.log({ dataWithoutOutliers: dataWithoutOutliers });
		plotMap(dataWithoutOutliers);
	}, 300);
});

$("#mapModal").on("hidden.bs.modal", function () {
	// myMap.removeLayer(featureLayerGroup);
	// myMap.removeLayer(tileLayerGroup);
	myMap.stopLocate();
	document
		.querySelector(
			"#myMap > div.leaflet-control-container > div.leaflet-top.leaflet-left > div.leaflet-control-locate.leaflet-bar.leaflet-control > a"
		)
		.parentNode.remove();
	layersGroups.forEach((group) => myMap.removeLayer(group));
	let layersCount = countLayers();
	console.log(layersCount);
	quadtree = null;
});

let layersGroups = [];

function countLayers() {
	let counter = 0;
	myMap.eachLayer((layer) => {
		layersGroups.push(layer);
		counter++;
	});
	return counter;
}
myMap.on("move", updateScale);

// var lastZoom;
const tooltipThreshold = 14;
myMap.on("zoomend", function () {
	var zoom = myMap.getZoom();
	console.log(zoom);
});

//data manipulation
function getFilteredDataFromTable() {
	let table = $("#data-table").DataTable();
	const data = Array.from(table.rows({ search: "applied" }).data());
	return data;
}

function filterDataWithLocations(data) {
	return data.filter((element) => element.latitud && element.longitud);
}

const removeOutliers = (arr) => {
	const arrMonth = arr.map((el) => moment(el.indice_tiempo));
	// console.log(arrMonth);
	const maxMonth = moment.max(arrMonth);
	// console.log(maxMonth);
	const perviousMonth = moment(maxMonth).add(-1, "month");
	// const max = moment(maxMonth).format("MM-YYYY");
	// const prev = moment(previousMonth).format("MM-YYYY");
	// console.log({ prev, max });
	return arr.filter(
		(el) =>
			el.indice_tiempo == maxMonth.format("YYYY-MM") ||
			el.indice_tiempo == perviousMonth.format("YYYY-MM")
	);
};

function getGeoJsonObject(data) {
	const dataWithoutOutliers = removeOutliers(data); //, "precio", 0.9, 100);
	let [minValue, maxValue] = getMinMax(dataWithoutOutliers, "precio");
	console.log(minValue, maxValue);
	const features = dataWithoutOutliers.map((station) => {
		const weight = getWeight(station.precio, minValue, maxValue);
		const backgroundColor = gradient(weight, ...colors);
		return {
			type: "Feature",
			geometry: {
				type: "Point",
				coordinates: [station.longitud, station.latitud],
			},
			properties: {
				producto: station.producto,
				empresa: station.empresa,
				empresabandera: station.empresabandera.split(" ")[0],
				precio: station.precio,
				indice_tiempo: station.indice_tiempo,
				region: station.region,
				localidad: station.localidad,
				direccion: station.direccion,
				backgroundColor: backgroundColor,
				textColor: getTextColor(backgroundColor),
			},
		};
	});

	const result = {
		type: "FeatureCollection",
		features: features,
	};
	return result;
}

function getMinMax(data, property) {
	const values = data.map((num) => num[property]);
	const minValue = Math.min(...values);
	const maxValue = Math.max(...values);
	return [minValue, maxValue];
}

//other auxiliary calculations
//how to get a color from a gradient based on a value?
function pickHex(color1, color2, weight) {
	let w1 = weight;
	let w2 = 1 - w1;
	let rgb = [
		Math.round(color1[0] * w1 + color2[0] * w2),
		Math.round(color1[1] * w1 + color2[1] * w2),
		Math.round(color1[2] * w1 + color2[2] * w2),
	];
	return rgb;
}

// t in range 0..1, start-middle-end are colors in hex e.g. #FF00FF
function gradient(t, start, middle, end) {
	return t >= 0.5
		? linear(middle, end, (t - 0.5) * 2)
		: linear(start, middle, t * 2);
}

function linear(s, e, x) {
	let r = byteLinear(s[1] + s[2], e[1] + e[2], x);
	let g = byteLinear(s[3] + s[4], e[3] + e[4], x);
	let b = byteLinear(s[5] + s[6], e[5] + e[6], x);
	return "#" + r + g + b;
}

// a,b are hex values from 00 to FF; x is real number in range 0..1
function byteLinear(a, b, x) {
	let y = (("0x" + a) * (1 - x) + ("0x" + b) * x) | 0;
	return y.toString(16).padStart(2, "0"); // hex output
}

function getRGB(c) {
	return parseInt(c, 16) || c;
}

function getsRGB(c) {
	return getRGB(c) / 255 <= 0.03928
		? getRGB(c) / 255 / 12.92
		: Math.pow((getRGB(c) / 255 + 0.055) / 1.055, 2.4);
}

function getLuminance(hexColor) {
	return (
		0.2126 * getsRGB(hexColor.substr(1, 2)) +
		0.7152 * getsRGB(hexColor.substr(3, 2)) +
		0.0722 * getsRGB(hexColor.substr(-2))
	);
}

function getContrast(f, b) {
	const L1 = getLuminance(f);
	const L2 = getLuminance(b);
	return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

function getTextColor(bgColor) {
	const whiteContrast = getContrast(bgColor, "#ffffff");
	const blackContrast = getContrast(bgColor, "#000000");

	return whiteContrast > blackContrast ? "#ffffff" : "#000000";
}

const getWeight = (actualValue, minValue, maxValue) => {
	return maxValue != minValue
		? (actualValue - minValue) / (maxValue - minValue)
		: 0.5;
};

//dom manipulation
function updateScale() {
	let visibleData = getVisibleMarkers();
	console.log(visibleData);
	let visibleDataProperties = visibleData.map((el) => el.feature.properties);
	let cleanVisibleData = removeOutliers(visibleDataProperties);
	let cleanData = Storage.get("dataWithoutOutliers");
	console.log(cleanData);
	let [minValue, maxValue] = getMinMax(cleanData, "precio");
	if (cleanVisibleData.length) {
		let [visibleMin, visibleMax] = getMinMax(cleanVisibleData, "precio");
		console.log({ minValue, visibleMin, visibleMax, maxValue });
		setColorScale(minValue, visibleMin, visibleMax, maxValue);
	}
}

function setColorScale(minValue, visibleMin, visibleMax, maxValue) {
	const colorScale = document.querySelector(".color-scale");
	const spanMin = document.querySelector(".min-indicator");
	const spanMax = document.querySelector(".max-indicator");
	let minWeight = getWeight(visibleMin, minValue, maxValue);
	let maxWeight = getWeight(visibleMax, minValue, maxValue);

	if (maxWeight - minWeight < MIN_MAX_COLLISION_THRESHOLD) {
		spanMax.style.opacity = 0;
	} else {
		spanMax.style.opacity = 1;
	}
	spanMin.textContent = `$${Math.round(visibleMin)}`;
	spanMax.textContent = `$${Math.round(visibleMax)}`;
	spanMin.style.transform = `translate(-45px, ${-7.3 * minWeight - 2.3}rem)`;
	spanMax.style.transform = `translate(-45px, ${-7.4 * maxWeight + 9.7}rem)`;
	const minValueText = document.querySelector(".min-scale-text");
	const maxValueText = document.querySelector(".max-scale-text");
	minValueText.textContent = `$${Math.round(minValue)}`;
	maxValueText.textContent = `$${Math.round(maxValue)}`;
	colorScale.style.background = `linear-gradient(${colors[2]}, ${colors[1]}, ${colors[0]})`;
}

//things that aren't in use
const myTriangleMarker = (lat_lng, weight) => {
	const color = gradient(weight, ...colors);
	return L.triangleMarker(lat_lng, {
		renderer: myRenderer, // your canvas renderer (default: L.canvas())
		rotation: 180, // triangle rotation in degrees (default: 0)
		width: 16, // width of the base of triangle (default: 24)
		height: 12, // height of triangle (default: 24)
		color: color,
		fillOpacity: 0.45,
		weight: 2,
		opacity: 0.6,
		// stroke: false,
	});
};
