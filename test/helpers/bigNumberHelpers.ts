import { formatEther, parseEther } from "ethers";

export const toNum = (bigNumber: bigint): number => Number(formatEther(bigNumber));
export const toBig = (number: number): bigint => {
  return parseEther(
    number.toLocaleString("en-US", {
      useGrouping: false,
      maximumFractionDigits: 18,
    })
  );
};
