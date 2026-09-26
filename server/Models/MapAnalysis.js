import mongoose from "mongoose";

const SummaryItemSchema = new mongoose.Schema(
  {
    name: String,
    area_name: String,
    latitude: Number,
    longitude: Number,
    category: String,
    source: String,
    osm_type: String,
    osm_id: mongoose.Schema.Types.Mixed,
    data_quality: String,
    category_confidence: Number,
    direct_competitors: Number,
    complementary_pois: Number,
    data_source_notes: String,
    data_source_notes_ar: String,
    data_source_notes_en: String,
    explanation_ar: String,
    explanation_en: String,
    address: String,
    distanceKm: Number,
    monthlyRent: Number,
    sizeSqm: Number,
    level: String,
    score: Number,
    reason: String,
    lat: Number,
    lng: Number,
  },
  {
    _id: false,
  }
);

const MapAnalysisSchema = new mongoose.Schema(
  {
    // Legacy ownerless rows stay unowned and are never used as assistant context.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "userInfos", required: true, immutable: true },
    provenance: {
      pipeline: String,
      generatedAt: Date,
      units: mongoose.Schema.Types.Mixed,
      dataSources: [String],
      quality: mongoose.Schema.Types.Mixed,
    },
    locationRecommendation: mongoose.Schema.Types.Mixed,
    rentalBudgetSuggestions: { type: [mongoose.Schema.Types.Mixed], default: undefined },
    projectName: {
      type: String,
      required: true,
      trim: true,
    },
    businessCategory: {
      type: String,
      required: true,
      trim: true,
    },
    customBusinessCategory: {
      type: String,
      trim: true,
      default: "",
    },
    city: {
      type: String,
      required: true,
      trim: true,
    },
    targetAudience: {
      type: String,
      required: true,
      trim: true,
    },
    estimatedBudget: {
      type: Number,
      required: true,
    },
    maxMonthlyRent: {
      type: Number,
      required: true,
    },
    searchRadiusKm: {
      type: Number,
      required: true,
    },
    areaName: {
      type: String,
      trim: true,
      default: "",
    },
    selectedLocation: {
      lat: Number,
      lng: Number,
      label: String,
      city: String,
    },
    competitorSummary: {
      count: Number,
      data_quality: String,
      category_confidence: Number,
      message_ar: String,
      message_en: String,
      level: String,
      items: [SummaryItemSchema],
    },
    rentalSummary: {
      totalAvailable: Number,
      withinBudget: Number,
      suitabilityLabel: String,
      bestOptions: [SummaryItemSchema],
    },
    engagementSummary: {
      level: String,
      score: Number,
      densityCount: Number,
      highlights: [String],
    },
    accessibilitySummary: {
      level: String,
      score: Number,
      highlights: [String],
    },
    scores: {
      competition: Number,
      rent: Number,
      engagement: Number,
      accessibility: Number,
    },
    locationScore: Number,
    rating: String,
    recommendation: String,
    alternatives: [SummaryItemSchema],
  },
  {
    timestamps: true,
  }
);

MapAnalysisSchema.index({ userId: 1, "provenance.pipeline": 1, createdAt: -1, _id: -1 });

const MapAnalysisModel = mongoose.model("mapAnalyses", MapAnalysisSchema);

export default MapAnalysisModel;
