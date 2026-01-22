// ======================================================================
// LANDSAT NDVI ANOMALY ANALYSIS — GENERIC VERSION
// ======================================================================

// ======================================================================
// USER SETTINGS (edit these)
// ======================================================================

var country_name = 'Kenya';  // Change to your country
var output_prefix = 'NDVI_Anomaly_' + country_name;

// CHOOSE AOI TYPE
var use_custom_aoi = true;  // Set to TRUE to use imported AOI, FALSE for entire country
// If use_custom_aoi = TRUE, make sure to import your AOI vector file in the Code Editor
// Rename the import to "AOI" in the Imports panel

// ======================================================================
// TIME PERIOD SETTINGS
// ======================================================================

// Full charting period (for monthly NDVI calculation)
var startYear = 2000;
var endYear = 2020;
var startMonth = 1;
var endMonth = 12;

// Baseline period (reference/normal conditions)
var b_start = "2000-01-01";
var b_end = "2015-02-28";
var bm_start = 1;      // Start day of year for baseline (https://www.timeanddate.com/date/duration.html?y1=1990&m1=1&d1=1)
var bm_end = 365;      // End day of year for baseline

// Anomaly/Study period (period to analyze for deviations)
var anom_start = "2015-03-01";
var anom_end = "2018-07-31";

// Date range for filtering Landsat collection
var f_start = '2000-01-01';
var f_end = '2020-12-31';

// ======================================================================
// PROCESSING SETTINGS
// ======================================================================

var scale = 100;  // Resolution in meters (30m=Landsat native, 100m recommended for speed)

// Land cover classes to include in NDVI calculation
// 10=Trees, 20=Shrubland, 30=Herbaceous vegetation
var lc_classes = [10, 20, 30];

// ======================================================================
// LOAD AOI (Country or Custom - imported via Imports panel)
// ======================================================================

var AOI;
var AOI_geometry;
var aoi_label;

if (use_custom_aoi) {
  // Use the imported AOI variable (you must import it in the Code Editor Imports panel first)
  // Rename your import to "AOI" in the Imports panel
  AOI = AOI;  // This references the imported variable from Imports
  AOI_geometry = AOI.geometry ? AOI.geometry() : AOI;
  aoi_label = 'Custom AOI (imported)';
  output_prefix = output_prefix + '_CustomAOI';
  print("Using custom AOI from Imports panel");
} else {
  // Load country boundary (LSIB dataset)
  var LSIB = ee.FeatureCollection("USDOS/LSIB_SIMPLE/2017");
  AOI = LSIB.filter(ee.Filter.eq('country_na', country_name));
  AOI_geometry = AOI.geometry();
  aoi_label = country_name + ' (entire country)';
  output_prefix = output_prefix + '_Country';
  print("Using entire country:", country_name);
}

// ======================================================================
// LOAD LANDSAT AND DEFINE FUNCTIONS
// ======================================================================

// ======================================================================
// SATELLITE DATA SOURCE — LANDSAT 7 (2000-2020)
// ======================================================================
// 
// WHY LANDSAT 7?
// - Available since 1999 (covers baseline period 2000-2015)
// - 30m resolution with 16-day revisit cycle
// - Matches the temporal range of your baseline period
// - Landsat 7 ETM+ has 8 bands including Red (Band 3) & NIR (Band 4)
// - Cloud-free images available even in tropical regions
// 
// BASELINE PERIOD (2000-2015):
// - Landsat 7 is primary data source (ETM+ Sensor - operational 1999-present)
// - Earlier Landsat 5 TM data (1984-2012) also available but with gaps
// - Using 2000-2015 ensures consistent Landsat 7 coverage
//
// ALTERNATIVE SATELLITE OPTIONS:
// If you want to extend or change the time period, consider:
//
// 1. LANDSAT 5 TM (1984-2012) — extends back to 1980s
//    Dataset: "LANDSAT/LT05/C02/T1_L2"
//    Pros: Earlier historical data, 30m resolution
//    Cons: Gaps in data, less coverage in later years
//    Use for: Long-term historical analysis (1984-2000)
//
// 2. LANDSAT 8 OLI (2013-present) — more recent data
//    Dataset: "LANDSAT/LC08/C02/T1_L2"
//    Pros: Better radiometric quality, newer sensor, still operational
//    Cons: Starts in 2013 (limits baseline period)
//    Use for: 2013-present analysis, higher quality recent data
//
// 3. SENTINEL-2 (2015-present) — high resolution alternative
//    Dataset: "COPERNICUS/S2_SR_HARMONIZED"
//    Pros: 10m resolution (3x finer than Landsat), 5-day revisit
//    Cons: Only available from 2015 onwards
//    Use for: High-resolution analysis from 2015 onwards
//
// 4. MODIS (2000-present) — continuous global coverage
//    Dataset: "MODIS/006/MOD13Q1" (NDVI) or MOD09GA (Surface Reflectance)
//    Pros: Daily coverage, no gaps, entire time series available
//    Cons: 250m resolution (lower detail than Landsat)
//    Use for: Large-area, continuous monitoring analysis
//
// TO CHANGE SATELLITE:
// - Replace the dataset name (line below)
// - Adjust band names for NDVI calculation (Red & NIR bands differ)
// - Update preprocessing function if needed
// ======================================================================

// Landsat 7 surface reflectance (SR) collection
// Collection 2, Tier 1 L2 (atmospherically corrected)
var dataset = ee.ImageCollection("LANDSAT/LE07/C02/T1_L2")
                  .filterDate(f_start, f_end)
                  .filterBounds(AOI_geometry);

print("Landsat 7 images available:", dataset.size());
print(dataset.first(), "Sample Landsat image");

// ======================================================================
// PREPROCESSING FUNCTIONS FOR LANDSAT 7
// ======================================================================

// Masking Landsat 7 surface reflectance images
// Removes clouds, cloud shadows, and saturated pixels
function prepSrL7(image) {
  var qaMask = image.select('QA_PIXEL').bitwiseAnd(parseInt('11111', 2)).eq(0);
  var saturationMask = image.select('QA_RADSAT').eq(0);

  // Applying the scaling factors to bands
  var getFactorImg = function(factorNames) {
    var factorList = image.toDictionary().select(factorNames).values();
    return ee.Image.constant(factorList);
  };
  var scaleImg = getFactorImg([
    'REFLECTANCE_MULT_BAND_.|TEMPERATURE_MULT_BAND_ST_B6']);
  var offsetImg = getFactorImg([
    'REFLECTANCE_ADD_BAND_.|TEMPERATURE_ADD_BAND_ST_B6']);
  var scaled = image.select('SR_B.|ST_B6').multiply(scaleImg).add(offsetImg);

  // Replacing original bands with scaled bands and applying masks
  return image.addBands(scaled, null, true)
    .updateMask(qaMask).updateMask(saturationMask);
}

// Load land cover classification (ESA WorldCover)
var lc = ee.ImageCollection('ESA/WorldCover/v200').first().clip(AOI_geometry);

// Calculate NDVI in vegetated areas only
// NDVI = (NIR - Red) / (NIR + Red)
// Landsat 7: Band 4 = NIR, Band 3 = Red
var addNDVI = function(image) {
  var ndvi = image.normalizedDifference(['SR_B4', 'SR_B3']).rename('NDVI');
  
  // Mask to vegetation classes
  var veg_mask = lc.eq(lc_classes[0]).or(lc.eq(lc_classes[1])).or(lc.eq(lc_classes[2]));
  ndvi = ndvi.updateMask(veg_mask);
  
  return image.addBands(ndvi);
};

// Apply preprocessing functions
var cloudmasked = dataset.map(prepSrL7);
var withNDVI = cloudmasked.map(addNDVI);

// Create baseline collection (for reference period)
var withNDVI_baseline = withNDVI.filterDate(b_start, b_end);

print("Baseline images:", withNDVI_baseline.size());

// ======================================================================
// CALCULATE MONTHLY NDVI AND ANOMALIES
// ======================================================================

var years = ee.List.sequence(startYear, endYear);
var months = ee.List.sequence(startMonth, endMonth);

// Calculate monthly average NDVI over full period
var monthlyNDVI = ee.ImageCollection.fromImages(
  years.map(function(y) {
    return months.map(function(m) {
      var filtered = withNDVI
        .select("NDVI")
        .filter(ee.Filter.calendarRange(y, y, 'year'))
        .filter(ee.Filter.calendarRange(m, m, 'month'))
        .mean();
      
      return filtered.set({
        'year': y,
        'month': m,
        'system:time_start': ee.Date.fromYMD(y, m, 1).millis()
      });
    });
  }).flatten()
);

print("Monthly NDVI collection:", monthlyNDVI.size());

// Debug – check for empty months
var emptyMonths = monthlyNDVI
  .filter(ee.Filter.eq('bandNames', []))
  .aggregate_array('system:time_start')
  .map(function(ms) {
    return ee.Date(ms).format('YYYY-MM');
  });
print('Months with empty NDVI:', emptyMonths);

// Calculate monthly average NDVI across baseline period
var meanMonthlyNDVI = ee.ImageCollection.fromImages(
  ee.List.sequence(1, 12).map(function(m) {
    var filtered = monthlyNDVI
      .filterDate(b_start, b_end)
      .filter(ee.Filter.eq('month', m))
      .mean();
    return filtered.set('month', m);
  })
);

print("Mean monthly NDVI (baseline):", meanMonthlyNDVI.size());

// Function to compute anomaly for each month
var computeAnomaly = function(image) {
  var year = image.get('year');
  var month = image.get('month');

  var referenceImage = meanMonthlyNDVI
    .filter(ee.Filter.eq('month', month))
    .first();

  var hasBands = image.bandNames().size().gt(0);

  var anomalyImage = ee.Algorithms.If(
    hasBands,
    ee.Algorithms.If(
      referenceImage.bandNames().size().gt(0),
      image.subtract(referenceImage),
      image
    ),
    image
  );
  
  return ee.Image(anomalyImage).set({
    'system:time_start': image.get('system:time_start'),
    'year': year,
    'month': month
  });
};

// Map anomaly calculation over entire collection
var monthlyNDVIAnomalies = monthlyNDVI.map(computeAnomaly);
print("Monthly NDVI anomalies (all years):", monthlyNDVIAnomalies.size());

// Filter to anomaly/study period only
var monthlyNDVIAnomalies_anom = monthlyNDVIAnomalies
  .filterDate(anom_start, anom_end);

print("Monthly NDVI anomalies (study period):", monthlyNDVIAnomalies_anom.size());

// ======================================================================
// DEVELOPING NDVI ANOMALY GRAPH (for study period only)
// ======================================================================

var chart = ui.Chart.image.series({
  imageCollection: monthlyNDVIAnomalies_anom,
  region: AOI_geometry,
  scale: scale,
  xProperty: 'system:time_start'
})
  .setSeriesNames(['NDVI anomaly'])
  .setOptions({
    title: 'Monthly NDVI anomaly (' + anom_start + ' to ' + anom_end + ')',
    series: {
      0: {
        targetAxisIndex: 0,
        type: 'line',
        lineWidth: 3,
        pointSize: 1,
        color: '#ffc61a'
      }
    },
    hAxis: {
      title: 'Date',
      titleTextStyle: {italic: false, bold: true}
    },
    vAxes: {
      0: {
        title: 'NDVI anomaly',
        baseline: 0,
        titleTextStyle: {bold: true, color: '#1a1aff'}
      }
    },
    curveType: 'function'
  });

print(chart);

// ======================================================================
// CONVERTING DATA TO TABLE (study period only)
// ======================================================================

var meanByMonth = monthlyNDVIAnomalies_anom.map(function(image) {
  var meanDict = image.reduceRegion({
    geometry: AOI_geometry,
    reducer: ee.Reducer.mean(),
    scale: scale
  });
  return ee.Feature(null, meanDict)
    .set('year', image.get('year'))
    .set('month', image.get('month'));
});

print("Mean monthly NDVI anomalies:", meanByMonth);

// ======================================================================
// CALCULATING NDVI ANOMALY IMAGES
// ======================================================================

// Long-term mean baseline NDVI over full year
var baseline = withNDVI_baseline
  .select("NDVI")
  .filter(ee.Filter.dayOfYear(bm_start, bm_end))
  .mean();

// Mean NDVI during study period
var study_meanNDVI = withNDVI
  .filterDate(anom_start, anom_end)
  .select("NDVI")
  .mean()
  .clip(AOI_geometry);

// Mean anomaly = (study mean) − (baseline mean)
var meanAnomaly = study_meanNDVI.subtract(baseline).rename("NDVI_mean_anomaly");

// Composite anomaly map (clipped to AOI)
var anomaly_AOI = study_meanNDVI.select("NDVI").subtract(baseline).clip(AOI_geometry);

// Visualization parameters
var anom_vis = {
  min: -0.1,
  max: 0.1,
  palette: ['FF0000', '000000', '00FF00']  // Red (loss) to Green (gain)
};

// ======================================================================
// MAP VISUALIZATION
// ======================================================================

var AOI_Vis = AOI.style({
  color: "FF4500",
  width: 2,
  fillColor: "FFFFFF00"
});

Map.addLayer(AOI_Vis, {}, aoi_label);
Map.addLayer(anomaly_AOI, anom_vis, "NDVI anomaly (mean)");
Map.centerObject(AOI_geometry, 6);

// ======================================================================
// EXPORTS — WITH CRS
// ======================================================================

// Export table of monthly anomalies
Export.table.toDrive({
  collection: meanByMonth,
  description: output_prefix + '_Monthly_Anomalies',
  fileNamePrefix: output_prefix + '_Monthly_Anomalies',
  fileFormat: 'CSV',
  selectors: ["year", "month", "NDVI"]
});

// Export mean anomaly raster
Export.image.toDrive({
  image: anomaly_AOI,
  description: output_prefix + '_Mean_Anomaly_' + startYear + '_' + endYear,
  fileNamePrefix: output_prefix + '_Mean_Anomaly_' + startYear + '_' + endYear,
  maxPixels: 1e13,
  region: AOI_geometry,
  scale: scale,
  fileFormat: 'GeoTIFF',
  crs: 'EPSG:4326'  // ← ADDED: WGS84 CRS
});

// Export baseline NDVI
Export.image.toDrive({
  image: baseline,
  description: output_prefix + '_Baseline_NDVI_' + b_start.substring(0,4) + '_' + b_end.substring(0,4),
  fileNamePrefix: output_prefix + '_Baseline_NDVI_' + b_start.substring(0,4) + '_' + b_end.substring(0,4),
  maxPixels: 1e13,
  region: AOI_geometry,
  scale: scale,
  fileFormat: 'GeoTIFF',
  crs: 'EPSG:4326'  // ← ADDED: WGS84 CRS
});

// Export study period NDVI
Export.image.toDrive({
  image: study_meanNDVI,
  description: output_prefix + '_Study_NDVI_' + anom_start.substring(0,4) + '_' + anom_end.substring(0,4),
  fileNamePrefix: output_prefix + '_Study_NDVI_' + anom_start.substring(0,4) + '_' + anom_end.substring(0,4),
  maxPixels: 1e13,
  region: AOI_geometry,
  scale: scale,
  fileFormat: 'GeoTIFF',
  crs: 'EPSG:4326'  // ← ADDED: WGS84 CRS
});

print("\n=== ALL EXPORTS QUEUED ===");
print("Output prefix:", output_prefix);
print("AOI:", aoi_label);
print("Baseline period:", b_start, "to", b_end);
print("Study period:", anom_start, "to", anom_end);
print("All files will be saved to Google Drive");
