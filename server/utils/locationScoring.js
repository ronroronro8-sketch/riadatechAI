import { getBusinessCategoryMapping } from "./businessTypeMapping.js";

export const SCORE_WEIGHTS = {
  startup: 0.3,
  business: 0.35,
  tourism: 0.2,
  craft: 0.15,
};

const COMPONENTS = [
  {
    id: "startup",
    countKey: "startup_count",
    categoryCountsKey: "startup_category_counts",
    outputScoreKey: "startup_score",
  },
  {
    id: "business",
    countKey: "business_activity_count",
    categoryCountsKey: "business_category_counts",
    outputScoreKey: "business_score",
  },
  {
    id: "tourism",
    countKey: "tourism_activity_count",
    categoryCountsKey: "tourism_category_counts",
    outputScoreKey: "tourism_score",
  },
  {
    id: "craft",
    countKey: "craft_activity_count",
    categoryCountsKey: "craft_category_counts",
    outputScoreKey: "craft_score",
  },
];

function toNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getRange(values) {
  const numericValues = values.map(toNumber);

  if (!numericValues.length) {
    return {
      min: 0,
      max: 0,
    };
  }

  return {
    min: Math.min(...numericValues),
    max: Math.max(...numericValues),
  };
}

export function normalizeValue(value, min, max) {
  const numericValue = toNumber(value);
  const numericMin = toNumber(min);
  const numericMax = toNumber(max);

  if (numericMax <= numericMin) {
    return numericValue > 0 ? 100 : 0;
  }

  return Math.round(
    clamp((numericValue - numericMin) / (numericMax - numericMin), 0, 1) * 100
  );
}

function getCategoryCount(area, component, canonicalType) {
  return toNumber(area?.[component.categoryCountsKey]?.[canonicalType]);
}

function componentHasCategoryData(areas, component, canonicalType) {
  return areas.some((area) => getCategoryCount(area, component, canonicalType) > 0);
}

function getMetricValue(area, component, canonicalType, useCategoryData) {
  if (useCategoryData) {
    return getCategoryCount(area, component, canonicalType);
  }

  return toNumber(area?.[component.countKey]);
}

function buildRanges(areas, businessType) {
  const mapping = getBusinessCategoryMapping(businessType);
  const canonicalType = mapping.canonicalType;
  const categoryMatchUsed = {};
  const ranges = {};

  for (const component of COMPONENTS) {
    const useCategoryData = componentHasCategoryData(areas, component, canonicalType);
    categoryMatchUsed[component.id] = useCategoryData;
    ranges[component.id] = getRange(
      areas.map((area) =>
        getMetricValue(area, component, canonicalType, useCategoryData)
      )
    );
  }

  return {
    canonicalType,
    categoryMatchUsed,
    ranges,
  };
}

export function calculateLocationScoreDetails(area, businessType, scoringContext) {
  const context = scoringContext || buildRanges([area], businessType);
  const componentScores = {};
  const metricCounts = {};

  for (const component of COMPONENTS) {
    const count = getMetricValue(
      area,
      component,
      context.canonicalType,
      context.categoryMatchUsed[component.id]
    );
    const range = context.ranges[component.id] || { min: 0, max: 0 };
    const normalizedScore = normalizeValue(count, range.min, range.max);

    componentScores[component.outputScoreKey] = normalizedScore;
    metricCounts[component.id] = count;
  }

  const score = Math.round(
    componentScores.startup_score * SCORE_WEIGHTS.startup +
      componentScores.business_score * SCORE_WEIGHTS.business +
      componentScores.tourism_score * SCORE_WEIGHTS.tourism +
      componentScores.craft_score * SCORE_WEIGHTS.craft
  );

  return {
    score: clamp(score, 0, 100),
    ...componentScores,
    metric_counts: metricCounts,
    category_match_used: {
      ...context.categoryMatchUsed,
    },
    open_data_weights: {
      ...SCORE_WEIGHTS,
    },
  };
}

export function calculateLocationScore(area, businessType, scoringContext) {
  return calculateLocationScoreDetails(area, businessType, scoringContext).score;
}

export function rankLocations(areas, businessType, referenceAreas = areas) {
  const safeAreas = Array.isArray(areas) ? areas : [];
  const safeReferenceAreas = Array.isArray(referenceAreas) && referenceAreas.length
    ? referenceAreas
    : safeAreas;
  const scoringContext = buildRanges(safeReferenceAreas.length ? safeReferenceAreas : [{}], businessType);

  return safeAreas
    .map((area) => {
      const scoreDetails = calculateLocationScoreDetails(
        area,
        businessType,
        scoringContext
      );

      return {
        ...area,
        ...scoreDetails,
        competitors: toNumber(area.business_competitors),
      };
    })
    .sort((first, second) => {
      if (second.score !== first.score) {
        return second.score - first.score;
      }

      return String(first.area_name || "").localeCompare(String(second.area_name || ""));
    });
}
