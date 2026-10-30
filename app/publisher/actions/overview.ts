"use server";

import {
  getPublisherOverviewStats as loadPublisherOverviewStats,
  getStaffOverviewStats as loadStaffOverviewStats,
} from "@/lib/staff-overview-stats";

export async function getPublisherOverviewStats() {
  return loadPublisherOverviewStats();
}

export async function getStaffOverviewStats() {
  return loadStaffOverviewStats();
}