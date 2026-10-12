import React, { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";

import { buildApiUrl } from "../api/httpClient";
import LocationInfoBox, {
  findMatchingCity,
  getDetectedLocationLabelForMap,
} from "./LocationInfoBox";
import MapResultsPanel from "./MapResultsPanel";
import DuqmResults from "./DuqmResults";
import LocalMap from "./LocalMap";
import SiteFooter from "./SiteFooter";
import "./MapAnalysis.css";
import {
  clearStoredDetectedLocation,
  extractLocationHierarchyFromGeocodeResult,
  fetchDetectedLocation as fetchDetectedLocationFromService,
  readStoredDetectedLocation,
} from "../utils/locationService";
import {
  businessCategoryOptions,
  cityCoordinates,
  cityOptions,
  loadGoogleMapsScript,
  targetAudienceOptions,
  uiText,
} from "./mapAnalysisConfig";

const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || "";
const DEFAULT_CITY = "Sohar";

function MapAnalysis({ locale = "ar" }) {
  const authenticatedUser = useSelector(state => state.auth.authChecked ? state.auth.user : null);
  const [form, setForm] = useState({
    projectName: "RiadaTech Business Scan",
    businessCategory: "Coffee Shop",
    customBusinessCategory: "",
    city: DEFAULT_CITY,
    targetAudience: "General Public",
    estimatedBudget: 15000,
    maxMonthlyRent: 700,
    searchRadiusKm: 3,
    areaName: "",
  });
  const [selectedLocation, setSelectedLocation] = useState({
    ...cityCoordinates[DEFAULT_CITY],
    label: DEFAULT_CITY,
  });
  const [duqmData, setDuqmData] = useState(null);
  const [dataMode, setDataMode] = useState('auto');
  const [fallbackMap, setFallbackMap] = useState(!GOOGLE_MAPS_API_KEY);
  const requestVersion = useRef(0);
  const [locationSearch, setLocationSearch] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [mapStatus, setMapStatus] = useState("");
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [detectedLocation, setDetectedLocation] = useState(() => readStoredDetectedLocation());
  const [detectedLocationLoading, setDetectedLocationLoading] = useState(false);
  const [detectedLocationError, setDetectedLocationError] = useState("");
  const [detectedLocationApplied, setDetectedLocationApplied] = useState(false);
  const [queuedDetectedLocation, setQueuedDetectedLocation] = useState(null);
  const [openSections, setOpenSections] = useState({
    overview: true,
    scores: true,
    alternatives: false,
    competitors: false,
    rentals: false,
  });

  const mapElementRef = useRef(null);
  const searchInputRef = useRef(null);
  const mapRef = useRef(null);
  const geocoderRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);
  const autocompleteRef = useRef(null);
  const competitorMarkersRef = useRef([]);
  const rentalMarkersRef = useRef([]);
  const recommendationMarkersRef = useRef([]);

  const text = uiText[locale];
  const direction = locale === "ar" ? "rtl" : "ltr";

  function getCityLabel(city) {
    return cityOptions.find((option) => option.value === city)?.[locale] || city;
  }

  function translateLevel(level) {
    const dictionary = {
      ar: {
        Low: "ضعيف",
        Medium: "متوسط",
        High: "مرتفع",
        "Low activity": "نشاط ضعيف",
        "Medium activity": "نشاط متوسط",
        "High activity": "نشاط مرتفع",
        Excellent: "ممتاز",
        Good: "جيد",
        Fair: "متوسط",
        Weak: "ضعيف",
        "Excellent fit": "ملاءمة ممتازة",
        "Good fit": "ملاءمة جيدة",
        "Fair fit": "ملاءمة متوسطة",
        Challenging: "تحدي مرتفع",
      },
      en: {},
    };

    return dictionary[locale][level] || level;
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat(locale === "ar" ? "ar-OM" : "en-US", {
      style: "currency",
      currency: "OMR",
      maximumFractionDigits: 0,
    }).format(value || 0);
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-OM" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  function clearMarkers(markersRef) {
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];
  }

  function drawPrimaryLocation(position, label) {
    if (!window.google || !mapRef.current) {
      return;
    }

    if (!markerRef.current) {
      markerRef.current = new window.google.maps.Marker({
        map: mapRef.current,
        position,
        draggable: true,
        title: label,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#00a8b8",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
      });

      markerRef.current.addListener("dragend", (event) => {
        if (!event.latLng) {
          return;
        }

        handleLocationChange({
          lat: event.latLng.lat(),
          lng: event.latLng.lng(),
        });
      });
    } else {
      markerRef.current.setPosition(position);
      markerRef.current.setTitle(label);
    }

    if (!circleRef.current) {
      circleRef.current = new window.google.maps.Circle({
        map: mapRef.current,
        strokeColor: "#00cfe0",
        strokeOpacity: 0.85,
        strokeWeight: 2,
        fillColor: "#00ddea",
        fillOpacity: 0.12,
        center: position,
        radius: form.searchRadiusKm * 1000,
      });
    } else {
      circleRef.current.setCenter(position);
      circleRef.current.setRadius(form.searchRadiusKm * 1000);
    }
  }

  function reverseGeocode(position) {
    if (!geocoderRef.current) {
      return;
    }

    geocoderRef.current.geocode({ location: position }, (results, status) => {
      if (status === "OK" && results?.[0]) {
        const parsedLocation = extractLocationHierarchyFromGeocodeResult(results[0]);
        const locationLabel = parsedLocation?.formattedAddress || results[0].formatted_address;

        setSelectedLocation((current) => ({
          ...current,
          label: locationLabel,
        }));
        setLocationSearch(locationLabel);
      }
    });
  }

  function handleLocationChange(position, label) {
    const activeCity = form.city || DEFAULT_CITY;
    const resolvedLabel = label || selectedLocation?.label || getCityLabel(activeCity);
    const nextLocation = {
      lat: Number(position.lat),
      lng: Number(position.lng),
      label: resolvedLabel,
    };

    setSelectedLocation(nextLocation);
    setErrorMessage("");

    if (mapRef.current) {
      mapRef.current.panTo(position);
    }

    drawPrimaryLocation(position, resolvedLabel);

    if (label) {
      setLocationSearch(label);
    } else {
      reverseGeocode(position);
    }
  }

  function renderMapMarkers(result) {
    if (!window.google || !mapRef.current) {
      return;
    }

    clearMarkers(competitorMarkersRef);
    clearMarkers(rentalMarkersRef);
    clearMarkers(recommendationMarkersRef);
    (result.locationRecommendations || []).forEach((item, index) => {
      const marker = new window.google.maps.Marker({map: mapRef.current, position: {lat: item.latitude, lng: item.longitude}, label: {text:String(index + 1),color:"#ffffff"}, icon:{path:window.google.maps.SymbolPath.CIRCLE,scale:13,fillColor:"#0ea5a8",fillOpacity:1,strokeColor:"#ffffff",strokeWeight:2}, title: item.area_name});
      marker.addListener('click', () => focusRecommendation(item));
      recommendationMarkersRef.current.push(marker);
    });

    (result.competitorSummary?.items || []).forEach((item) => {
      competitorMarkersRef.current.push(
        new window.google.maps.Marker({
          map: mapRef.current,
          position: { lat: item.lat, lng: item.lng },
          title: item.name,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: "#ef4444",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        })
      );
    });

    (result.rentalSummary?.bestOptions || []).forEach((item) => {
      rentalMarkersRef.current.push(
        new window.google.maps.Marker({
          map: mapRef.current,
          position: { lat: item.lat, lng: item.lng },
          title: item.name,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: "#16a34a",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        })
      );
    });
  }

  function handleFieldChange(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: name === "estimatedBudget" || name === "maxMonthlyRent" ? Number(value) : value,
    }));
  }

  async function getJson(url) {
    const response = await fetch(url, {signal: AbortSignal.timeout(20000)}).catch(() => {
      throw new Error(locale === 'ar' ? 'خدمة التحليل غير متاحة الآن. أعد المحاولة بعد تشغيل التطبيق.' : 'The analysis service is unavailable. Start the application and try again.');
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || text.analysisError);
    }

    return data;
  }

  function getApiRating(score) {
    if (score >= 80) {
      return "Excellent";
    }

    if (score >= 70) {
      return "Good";
    }

    if (score >= 50) {
      return "Fair";
    }

    return "Weak";
  }

  function getApiCompetitionLevel(competitors) {
    if (competitors <= 4) {
      return "Low";
    }

    if (competitors <= 12) {
      return "Medium";
    }

    return "High";
  }

  function buildRecommendationAnalysis(
    recommendationPayload,
    businessType,
    competitorPayload = {},
    alternativePayload = {},
    rentalBudgetPayload = {}
  ) {
    const recommendations = recommendationPayload.recommendations || [];
    const primaryRecommendation = recommendations[0];
    const score = Number(primaryRecommendation?.score || 0);
    const competitorItems = Array.isArray(competitorPayload.competitors)
      ? competitorPayload.competitors
      : [];
    const alternatives = Array.isArray(alternativePayload.alternatives)
      ? alternativePayload.alternatives
      : [];
    const competitors = Number(competitorPayload.count ?? competitorItems.length);

    return {
      source: "location-recommendations",
      query: recommendationPayload.query,
      competitorQuery: competitorPayload,
      alternativeQuery: alternativePayload,
      rentalBudgetQuery: rentalBudgetPayload,
      locationRecommendation: primaryRecommendation,
      locationRecommendations: recommendations,
      selectedLocation: {
        lat: primaryRecommendation.latitude,
        lng: primaryRecommendation.longitude,
        label: primaryRecommendation.area_name,
        city: primaryRecommendation.wilayat,
        areaName: primaryRecommendation.area_name,
      },
      competitorSummary: {
        count: competitors,
        level: getApiCompetitionLevel(competitors),
        data_quality: competitorPayload.data_quality,
        category_confidence: competitorPayload.category_confidence,
        message_ar: competitorPayload.message_ar,
        message_en: competitorPayload.message_en,
        items: competitorItems.map((item) => ({
          name: item.name,
          category: item.category,
          lat: item.latitude,
          lng: item.longitude,
          latitude: item.latitude,
          longitude: item.longitude,
          distanceKm: item.distanceKm,
          source: item.source,
          osm_type: item.osm_type,
          osm_id: item.osm_id,
        })),
      },
      rentalSummary: {
        totalAvailable: 0,
        withinBudget: 0,
        suitabilityLabel: "",
        bestOptions: [],
      },
      engagementSummary: {
        level: "Medium activity",
        score,
        densityCount: Number(primaryRecommendation.business_activity_count || 0),
        highlights: [
          `${primaryRecommendation.business_activity_count} business activity records`,
          `${primaryRecommendation.startup_count} startup records`,
          `${primaryRecommendation.tourism_activity_count} tourism activity records`,
          `${primaryRecommendation.craft_activity_count} craft activity records`,
        ],
      },
      accessibilitySummary: {
        level: "Medium",
        score,
        highlights: [
          primaryRecommendation.governorate,
          primaryRecommendation.wilayat,
        ],
      },
      scores: {
        competition: primaryRecommendation.business_score,
        rent: primaryRecommendation.startup_score,
        engagement: primaryRecommendation.tourism_score,
        accessibility: primaryRecommendation.craft_score,
      },
      locationScore: score,
      rating: getApiRating(score),
      recommendation:
        primaryRecommendation.explanation_en ||
        primaryRecommendation.explanation ||
        `Recommended location for ${businessType}: ${primaryRecommendation.area_name}`,
      alternatives,
      rentalBudgetSuggestions: rentalBudgetPayload.suggestions || [],
      generatedAt: new Date().toISOString(),
    };
  }

  function toggleSection(sectionKey) {
    setOpenSections((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey],
    }));
  }

  function applyDetectedLocation(locationData) {
    if (
      typeof locationData?.coordinates?.lat !== "number" ||
      typeof locationData?.coordinates?.lng !== "number"
    ) {
      return;
    }

    const matchedCity = findMatchingCity(locationData, cityOptions);
    const detectedLabel =
      getDetectedLocationLabelForMap(locationData) || getCityLabel(form.city);
    const nextAreaValue =
      locationData.area ||
      locationData.neighborhood ||
      locationData.wilayat ||
      locationData.city ||
      locationData.governorate ||
      locationData.region ||
      "";

    setForm((current) => ({
      ...current,
      city: matchedCity?.value || current.city,
      areaName: current.areaName || nextAreaValue,
    }));

    if (matchedCity && matchedCity.value !== form.city) {
      setQueuedDetectedLocation({
        city: matchedCity.value,
        label: detectedLabel,
        coordinates: locationData.coordinates,
      });
    } else {
      handleLocationChange(locationData.coordinates, detectedLabel);
    }

    setDetectedLocationApplied(true);
  }

  async function fetchDetectedLocation() {
    console.log("Update Location button clicked");
    setDetectedLocationLoading(true);
    setDetectedLocationError("");
    setDetectedLocationApplied(false);
    setQueuedDetectedLocation(null);
    setDetectedLocation(null);
    clearStoredDetectedLocation();

    try {
      const nextLocation = await fetchDetectedLocationFromService();
      setDetectedLocation(nextLocation);
      applyDetectedLocation(nextLocation);
    } catch (error) {
      console.log("fetchDetectedLocation failed", error);
      setDetectedLocation(null);
      clearStoredDetectedLocation();
      setDetectedLocationError(error.message);
    } finally {
      setDetectedLocationLoading(false);
    }
  }

  function focusRecommendation(item) {
    handleLocationChange({lat:item.latitude,lng:item.longitude}, locale === 'ar' ? item.area_name_ar || item.area_name : item.area_name);
    mapRef.current?.setZoom(14);
    mapElementRef.current?.scrollIntoView({behavior:'smooth', block:'center'});
  }

  function duqmParams() {
    return new URLSearchParams({city:form.city, businessType:form.businessCategory === 'Other' ? form.customBusinessCategory || form.projectName : form.businessCategory,
      projectName:form.projectName, targetAudience:form.targetAudience, maxMonthlyRent:String(form.maxMonthlyRent), startupBudget:String(form.estimatedBudget),
      radiusKm:String(form.searchRadiusKm), lat:String(selectedLocation.lat), lng:String(selectedLocation.lng), areaName:form.areaName, mode:dataMode});
  }

  async function handleAnalyze(event) {
    event.preventDefault();

    if (!selectedLocation) {
      setErrorMessage(text.chooseLocationError);
      return;
    }

    const version = ++requestVersion.current;
    setAnalysisLoading(true);
    setErrorMessage("");

    try {
      if (form.city === 'Duqm') {
        const result = await getJson(buildApiUrl('/api/city-analysis?' + duqmParams()));
        if (version !== requestVersion.current) return;
        if (!Array.isArray(result.recommendations) || result.recommendations.length !== 3 || !Array.isArray(result.records) || !Array.isArray(result.competitors)) throw new Error(locale === 'ar' ? 'استجابة التحليل غير مكتملة. أعد المحاولة أو اختر وضع DEMO.' : 'The analysis response is incomplete. Retry or select DEMO mode.');
        const nextAnalysis = {duqm: result, rentalSummary: {totalAvailable:0, bestOptions:[]}, locationScore:result.recommendations[0].score, competitorSummary:{count:result.competitor_count, items:result.records.filter(p=>p.is_competitor).map(p=>({...p,lat:p.latitude,lng:p.longitude}))}, locationRecommendations:result.recommendations};
        setDuqmData(result);
        setAnalysisResult(nextAnalysis);
        renderMapMarkers(nextAnalysis);
        if (authenticatedUser) {
          const saved = await fetch(buildApiUrl('/api/map-analysis/save'), {method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-RiadaTech-Request':'1'},body:JSON.stringify({inputs:{...form,mode:dataMode,location:selectedLocation}})});
          if (!saved.ok) throw new Error(locale==='ar'?'تم التحليل، لكن تعذر الحفظ في الحساب.':'Analysis is ready, but saving to your account failed.');
        }
        return;
      }
      const selectedBusinessType =
        form.businessCategory === "Other" && form.customBusinessCategory.trim()
          ? form.customBusinessCategory.trim()
          : form.businessCategory;
      const selectedCity = form.city || DEFAULT_CITY;
      const recommendationParams = new URLSearchParams({
        city: selectedCity,
        businessType: selectedBusinessType,
      });
      const recommendationPayload = await getJson(
        buildApiUrl(`/api/location-recommendations?${recommendationParams.toString()}`)
      );

      if (!recommendationPayload.recommendations?.length) {
        throw new Error(
          locale === "ar"
            ? "لا توجد توصيات متاحة لهذا الموقع حاليًا."
            : "No recommendations are available for this location yet."
        );
      }

      const primaryRecommendation = recommendationPayload.recommendations[0];
      const competitorParams = new URLSearchParams({
        city: selectedCity,
        businessType: selectedBusinessType,
        lat: String(primaryRecommendation.latitude),
        lng: String(primaryRecommendation.longitude),
        radiusKm: String(form.searchRadiusKm || 3),
      });
      const alternativeParams = new URLSearchParams({
        city: selectedCity,
        businessType: selectedBusinessType,
      });
      const rentalBudgetParams = new URLSearchParams({
        city: selectedCity,
        businessType: selectedBusinessType,
        maxMonthlyRent: String(form.maxMonthlyRent || 0),
        startupBudget: String(form.estimatedBudget || 0),
      });
      const [competitorPayload, alternativePayload, rentalBudgetPayload] = await Promise.all([
        getJson(buildApiUrl(`/api/location-competitors?${competitorParams.toString()}`)),
        getJson(buildApiUrl(`/api/alternative-locations?${alternativeParams.toString()}`)),
        getJson(
          buildApiUrl(`/api/rental-budget-suggestions?${rentalBudgetParams.toString()}`)
        ).catch(() => ({
          suggestions: [],
          warning:
            locale === "ar"
              ? "تعذر تحميل بيانات الإيجار التجريبية."
              : "Prototype rental data could not be loaded.",
        })),
      ]);
      const nextAnalysis = buildRecommendationAnalysis(
        recommendationPayload,
        selectedBusinessType,
        competitorPayload,
        alternativePayload,
        rentalBudgetPayload
      );
      const recommendedLocation = nextAnalysis.locationRecommendation;

      handleLocationChange(
        {
          lat: recommendedLocation.latitude,
          lng: recommendedLocation.longitude,
        },
        recommendedLocation.area_name
      );

      if (version !== requestVersion.current) return;
      setAnalysisResult(nextAnalysis);
      renderMapMarkers(nextAnalysis);
      if (authenticatedUser) {
        const saved = await fetch(buildApiUrl("/api/map-analysis/save"), {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json", "X-RiadaTech-Request": "1" },
          body: JSON.stringify({ inputs: { ...form, location: selectedLocation } }),
        });
        if (!saved.ok) throw new Error(locale === "ar"
          ? "ظهر التحليل، لكن تعذر حفظه لاستخدامه في المساعد. أعد المحاولة."
          : "Analysis displayed, but saving it for the assistant failed. Please retry.");
      }
    } catch (error) {
      if (version === requestVersion.current) setErrorMessage(error.message || text.analysisError);
    } finally {
      if (version === requestVersion.current) setAnalysisLoading(false);
    }
  }

  function getScoreTone(score) {
    if (score >= 80) {
      return "strong";
    }

    if (score >= 60) {
      return "balanced";
    }

    return "subtle";
  }

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) {
      setMapStatus(text.mapKeyMissing);
      return undefined;
    }

    let cancelled = false;
    const timeout = setTimeout(() => { if (!cancelled && !mapRef.current) setFallbackMap(true); }, 12000);
    window.gm_authFailure = () => { if (!cancelled) setFallbackMap(true); };

    loadGoogleMapsScript(GOOGLE_MAPS_API_KEY)
      .then(() => {
        if (cancelled || !mapElementRef.current) {
          return;
        }

        const activeCity = form.city || DEFAULT_CITY;
        const initialCenter = cityCoordinates[activeCity] || cityCoordinates[DEFAULT_CITY];

        mapRef.current = new window.google.maps.Map(mapElementRef.current, {
          center: initialCenter,
          zoom: 13,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });
        geocoderRef.current = new window.google.maps.Geocoder();

        mapRef.current.addListener("click", (event) => {
          if (!event.latLng) {
            return;
          }

          handleLocationChange({
            lat: event.latLng.lat(),
            lng: event.latLng.lng(),
          });
        });

        if (searchInputRef.current) {
          autocompleteRef.current = new window.google.maps.places.Autocomplete(
            searchInputRef.current,
            {
              componentRestrictions: { country: "om" },
              fields: ["address_components", "formatted_address", "geometry", "name"],
            }
          );

          autocompleteRef.current.addListener("place_changed", () => {
            const place = autocompleteRef.current.getPlace();

            if (!place.geometry?.location) {
              return;
            }

            const parsedLocation = extractLocationHierarchyFromGeocodeResult(place);
            const locationLabel =
              parsedLocation?.formattedAddress || place.formatted_address || place.name;

            handleLocationChange(
              {
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng(),
              },
              locationLabel
            );
          });
        }

        handleLocationChange(initialCenter, getCityLabel(activeCity));
        clearTimeout(timeout);
        setMapReady(true);
        setMapStatus("");
      })
      .catch((error) => {
        setFallbackMap(true);
        setMapStatus(error.message || text.mapKeyMissing);
      });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      delete window.gm_authFailure;
      clearMarkers(competitorMarkersRef);
      clearMarkers(rentalMarkersRef);
      clearMarkers(recommendationMarkersRef);
    };
  }, []);

  useEffect(() => {
    const activeCity = form.city || DEFAULT_CITY;
    const cityCenter = cityCoordinates[activeCity] || cityCoordinates[DEFAULT_CITY];
    mapRef.current?.panTo(cityCenter);
    mapRef.current?.setZoom(12);
    handleLocationChange(cityCenter, getCityLabel(activeCity));
    clearMarkers(competitorMarkersRef);
    clearMarkers(rentalMarkersRef);
    clearMarkers(recommendationMarkersRef);
    setAnalysisResult(null);
  }, [form.city, mapReady]);

  useEffect(() => {
    if (circleRef.current) {
      circleRef.current.setRadius(form.searchRadiusKm * 1000);
    }
  }, [form.searchRadiusKm]);

  useEffect(() => {
    if (analysisResult) {
      renderMapMarkers(analysisResult);
    }
  }, [analysisResult]);

  useEffect(() => {
    if (
      !mapReady ||
      !queuedDetectedLocation ||
      queuedDetectedLocation.city !== form.city
    ) {
      return;
    }

    handleLocationChange(queuedDetectedLocation.coordinates, queuedDetectedLocation.label);
    setQueuedDetectedLocation(null);
  }, [form.city, mapReady, queuedDetectedLocation]);
  useEffect(() => {
    requestVersion.current += 1;
    setAnalysisLoading(false);
    setAnalysisResult(null);
    clearMarkers(competitorMarkersRef); clearMarkers(rentalMarkersRef); clearMarkers(recommendationMarkersRef);
    if (form.city !== 'Duqm') { setDuqmData(null); return; }
    const controller = new AbortController();
    const params = duqmParams();
    // Use the city center for the preview; the submitted request uses the selected point.
    params.set('lat', String(cityCoordinates.Duqm.lat)); params.set('lng', String(cityCoordinates.Duqm.lng));
    setDuqmData(null);
    fetch(buildApiUrl('/api/city-analysis?' + params), {signal:controller.signal})
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error || text.analysisError); return body; })
      .then(data => { setDuqmData(data); setErrorMessage(''); })
      .catch(error => { if(error.name !== 'AbortError') setErrorMessage(error instanceof TypeError ? (locale==='ar'?'خدمة التحليل غير متاحة الآن. أعد المحاولة بعد تشغيل التطبيق.':'The analysis service is unavailable. Start the application and try again.') : error.message || text.analysisError); });
    return () => controller.abort();
  }, [form.city, form.businessCategory, form.customBusinessCategory, form.targetAudience, form.maxMonthlyRent, form.estimatedBudget, form.searchRadiusKm, dataMode]);

  useEffect(() => {
    if (duqmData && !analysisResult && mapReady) renderMapMarkers({competitorSummary:{items:duqmData.records.filter(p=>p.is_competitor).map(p=>({...p,lat:p.latitude,lng:p.longitude}))}});
  }, [duqmData, analysisResult, mapReady]);
  /* eslint-enable react-hooks/exhaustive-deps */


  return (
    <div className="rt-map-page" dir={direction}>
      <main className="rt-map-section">
        <div className="rt-map-container">
          <section className="rt-map-hero">
            <div className="rt-map-hero-grid">
              <div>
                <span className="rt-map-badge">{text.badge}</span>
                <h1 className="rt-map-title">
                  {text.titleLineOne}
                  <br />
                  <span>{text.titleAccent}</span>
                </h1>
                <p className="rt-map-description">{form.city === "Duqm" ? (locale === "ar" ? "قارن مواقع في الدقم باستخدام سجلات الخرائط المحفوظة ومؤشرات ملاءمة تقديرية، مع أمثلة تجريبية واضحة عند نقص البيانات." : "Compare Duqm locations using cached map records and estimated suitability, with clearly labeled examples where data is missing.") : text.description}</p>
                <div className="rt-map-hero-actions">
                  <button
                    type="button"
                    className="rt-map-button"
                    onClick={() => searchInputRef.current?.focus()}
                  >
                    {text.startButton}
                  </button>
                </div>
                <div className="rt-map-stats-grid">
                  <div className="rt-map-stat-card">
                    <strong>{text.statOneTitle}</strong>
                    <span>{text.statOneText}</span>
                  </div>
                  <div className="rt-map-stat-card">
                    <strong>{text.statTwoTitle}</strong>
                    <span>{text.statTwoText}</span>
                  </div>
                  <div className="rt-map-stat-card">
                    <strong>{text.statThreeTitle}</strong>
                    <span>{text.statThreeText}</span>
                  </div>
                </div>
              </div>
              <div className="rt-map-hero-card">
                <span className="rt-map-badge">{text.heroCardBadge}</span>
                <h3>{text.heroCardTitle}</h3>
                <p>{form.city === "Duqm" ? (locale === "ar" ? "المنافسون والخدمات من الخرائط عند توفرها. لا توجد أرقام موثقة للسكان أو الإيجارات ضمن هذا التحليل." : "Competitors and services use available map records. This analysis has no verified population or rental figures.") : text.heroCardText}</p>
                <div className="rt-map-stats-grid">
                  <div className="rt-map-stat-card">
                    <strong>{analysisResult?.competitorSummary.count ?? 0}</strong>
                    <span>{text.nearbyCompetitors}</span>
                  </div>
                  <div className="rt-map-stat-card">
                    <strong>{analysisResult?.rentalSummary.totalAvailable ?? 0}</strong>
                    <span>{text.rentalAvailability}</span>
                  </div>
                  <div className="rt-map-stat-card">
                    <strong>
                      {Number.isFinite(Number(analysisResult?.locationScore))
                        ? `${Number(analysisResult.locationScore)} / 100`
                        : "--"}
                    </strong>
                    <span>{text.finalScore}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rt-map-analysis-layout">
            <form className="rt-map-panel" onSubmit={handleAnalyze}>
              <h2 className="rt-map-panel-title">{text.formTitle}</h2>
              <p className="rt-map-panel-description">{text.formDescription}</p>
              {form.city === 'Duqm' && <div className="rt-map-field"><label htmlFor="duqm-mode">{locale==='ar'?'مصدر البيانات':'Data mode'}</label><select id="duqm-mode" value={dataMode} onChange={e=>setDataMode(e.target.value)}><option value="auto">{locale==='ar'?'بيانات محفوظة + تجريبي عند نقص البيانات':'Cached data + labeled demo fallback'}</option><option value="demo">DEMO / {locale==='ar'?'بيانات محاكاة':'Simulated data'}</option></select></div>}
              <div className="rt-map-form-grid">
                <div className="rt-map-field rt-map-field-full">
                  <label htmlFor="projectName">{form.city === "Duqm" ? (locale === "ar" ? "فكرة المشروع" : "Business idea") : text.projectName}</label>
                  <input id="projectName" name="projectName" value={form.projectName} onChange={handleFieldChange} />
                </div>
                <div className="rt-map-field">
                  <label htmlFor="businessCategory">{text.businessCategory}</label>
                  <select id="businessCategory" name="businessCategory" value={form.businessCategory} onChange={handleFieldChange}>
                    {businessCategoryOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option[locale]}</option>
                    ))}
                  </select>
                </div>
                <div className="rt-map-field">
                  <label htmlFor="city">{text.city}</label>
                  <select id="city" name="city" value={form.city} onChange={handleFieldChange}>
                    {cityOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option[locale]}</option>
                    ))}
                  </select>
                </div>
                {form.businessCategory === "Other" ? (
                  <div className="rt-map-field rt-map-field-full">
                    <label htmlFor="customBusinessCategory">{text.customCategory}</label>
                    <input
                      id="customBusinessCategory"
                      name="customBusinessCategory"
                      value={form.customBusinessCategory}
                      onChange={handleFieldChange}
                    />
                  </div>
                ) : null}
                <div className="rt-map-field">
                  <label htmlFor="targetAudience">{text.audience}</label>
                  <select id="targetAudience" name="targetAudience" value={form.targetAudience} onChange={handleFieldChange}>
                    {targetAudienceOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option[locale]}</option>
                    ))}
                  </select>
                </div>
                <div className="rt-map-field">
                  <label htmlFor="areaName">{text.areaName}</label>
                  <input id="areaName" name="areaName" value={form.areaName} onChange={handleFieldChange} />
                </div>
                <div className="rt-map-field">
                  <label htmlFor="estimatedBudget">{text.estimatedBudget}</label>
                  <input id="estimatedBudget" name="estimatedBudget" type="number" min="0" value={form.estimatedBudget} onChange={handleFieldChange} />
                </div>
                <div className="rt-map-field">
                  <label htmlFor="maxMonthlyRent">{text.maxRent}</label>
                  <input id="maxMonthlyRent" name="maxMonthlyRent" type="number" min="0" value={form.maxMonthlyRent} onChange={handleFieldChange} />
                </div>
                <div className="rt-map-field rt-map-field-full">
                  <label htmlFor="searchRadiusKm">{text.radius}</label>
                  <div className="rt-map-range-line">
                    <span>{form.searchRadiusKm} km</span>
                    <strong>{form.searchRadiusKm * 1000} m</strong>
                  </div>
                  <input
                    id="searchRadiusKm"
                    className="rt-map-range-input"
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={form.searchRadiusKm}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        searchRadiusKm: Number(event.target.value),
                      }))
                    }
                  />
                </div>
              </div>
              {errorMessage ? <div className="rt-map-error-banner">{errorMessage}</div> : null}
              <div className="rt-map-hero-actions">
                <button type="submit" className="rt-map-button" disabled={analysisLoading}>
                  {analysisLoading ? text.analysisLoading : text.startButton}
                </button>
              </div>
            </form>

            <section className="rt-map-panel">
              <h2 className="rt-map-panel-title">{text.mapTitle}</h2>
              <p className="rt-map-panel-description">{text.mapDescription}</p>
              <div className="rt-map-map-toolbar">
                <input
                  ref={searchInputRef}
                  className="rt-map-search-input"
                  type="text"
                  placeholder={text.searchLocation}
                  value={locationSearch}
                  onChange={(event) => setLocationSearch(event.target.value)}
                />
                <div className="rt-map-status-banner">
                  <strong>{text.selectedLocation}: </strong>
                  {selectedLocation?.label || getCityLabel(form.city)}
                </div>
              </div>
              {form.city === 'Duqm' && duqmData && <div className="rt-map-status-banner">{locale==='ar'?duqmData.notice_ar:duqmData.notice_en}<br />{locale==='ar'?'سجلات المنافسين في الدقم':'Competitor records in Duqm'}: {duqmData.records.filter(p=>p.is_competitor).length}</div>}
              {form.city === 'Duqm' && <div className="rt-duqm-search-results">{duqmData?.records.filter(p=>locationSearch.length > 1 && p.name.toLowerCase().includes(locationSearch.toLowerCase())).slice(0,6).map(p=><button type="button" className="rt-map-button" key={p.id} onClick={()=>handleLocationChange({lat:p.latitude,lng:p.longitude},p.name)}>{p.name} · {p.data_kind}</button>)}</div>}
              {mapStatus ? <div className="rt-map-map-hint">{mapStatus}</div> : null}
              <div className="rt-map-map-hint">{text.mapHint}</div>
              <div className="rt-map-canvas">
                <div ref={mapElementRef} style={{ width: '100%', minHeight: '470px', display:fallbackMap?'none':'block' }} />
                {fallbackMap && <LocalMap location={selectedLocation} recommendations={analysisResult?.locationRecommendations || []} records={form.city==='Duqm' ? duqmData?.records || [] : (analysisResult?.competitorSummary?.items || []).map(p=>({...p,latitude:p.lat,longitude:p.lng,data_kind:'REAL',is_competitor:true}))} boundary={form.city==='Duqm'?duqmData?.boundary:undefined} onSelect={handleLocationChange} locale={locale} />}
              </div>
              <div className="rt-map-legend">
                <div className="rt-map-legend-item"><span className="rt-map-legend-swatch primary" />{text.markerSelected}</div>
                <div className="rt-map-legend-item"><span className="rt-map-legend-swatch competitor" />{text.markerCompetitor}</div>
                <div className="rt-map-legend-item"><span className="rt-map-legend-swatch rental" />{text.markerRental}</div>
              </div>
              <LocationInfoBox
                locale={locale}
                detectedLocation={detectedLocation}
                loading={detectedLocationLoading}
                error={detectedLocationError}
                applied={detectedLocationApplied}
                onRefresh={fetchDetectedLocation}
                onApply={() => applyDetectedLocation(detectedLocation)}
              />
            </section>
          </section>

          <section className="rt-map-results">
            <div className="rt-map-results-header">
              <h2>{text.resultsTitle}</h2>
              <p>{form.city === "Duqm" ? (locale === "ar" ? "تقييم تقديري مبني على سجلات الخرائط المتاحة وبيانات تجريبية معلّمة عند الحاجة." : "Estimated suitability from available map records and labeled demo data where needed.") : text.resultsDescription}</p>
            </div>
            {analysisResult?.duqm ? <DuqmResults result={analysisResult.duqm} locale={locale} onFocus={focusRecommendation} /> : <MapResultsPanel
              analysisResult={analysisResult}
              locale={locale}
              text={text}
              openSections={openSections}
              toggleSection={toggleSection}
              formatDate={formatDate}
              formatCurrency={formatCurrency}
              translateLevel={translateLevel}
              getScoreTone={getScoreTone}
            />}
          </section>
        </div>
      </main>
      <SiteFooter locale={locale} />
    </div>
  );
}

export default MapAnalysis;


