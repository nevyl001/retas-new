import React from "react";
import { isRewardsPath } from "./rewardsNav";
import { RewardsPage } from "./RewardsPage";

export const RewardsRouter: React.FC<{ pathname: string }> = ({ pathname }) => {
  if (!isRewardsPath(pathname)) return null;
  return <RewardsPage pathname={pathname} />;
};
