export type Analytics = {
  firstOpen: number;
  lastActive: number;
  sessions: number;
  screenViews: Record<string, number>;
};

export const EMPTY_ANALYTICS: Analytics = {
  firstOpen: 0,
  lastActive: 0,
  sessions: 0,
  screenViews: {},
};
