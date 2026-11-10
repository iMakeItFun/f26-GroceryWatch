
export type AnomalyType =
    | "PRE_SALE_INFLATION"
    | "INFLATED_REFERENCE_PRICE"
    | "PERPETUAL_SALE";

export type PriceObservation = {
    id: string;
    price: number;
    regularPrice: number | null;
    promoPrice: number | null;
    observedAt: Date;
};

export type AnomalyResult = {
    anomalous: boolean;
    reasons: AnomalyType[];
    historicalMedian: number | null;
    observedDiscountPercent: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const CONFIG = {
    historyDays: 90,
    recentIncreaseDays: 30,
    minimumIncreasePercent: 20,
    minimumBaselineObservations: 7,
    minimumBaselineSpanDays: 14,
    perpetualSaleDays: 30,
    perpetualSaleThreshold: 0.70,
    minimumPerpetualObservations: 21,
};

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2;
    }

    return sorted[middle];
}

function isValidPrice(price: number | null): price is number {
    return (
        price !== null &&
        Number.isFinite(price) &&
        price > 0
    );
}

function isOnSale(observation: PriceObservation): boolean {
    return (
        isValidPrice(observation.regularPrice) &&
        isValidPrice(observation.promoPrice) &&
        observation.promoPrice < observation.regularPrice
    );
}

export function detectSaleAnomalies(
    current: PriceObservation,
    history: PriceObservation[]
): AnomalyResult {
    const reasons: AnomalyType[] = [];

    const currentTime = current.observedAt.getTime();
    const ninetyDaysAgo =
        currentTime - CONFIG.historyDays * DAY_MS;
    const thirtyDaysAgo =
        currentTime - CONFIG.recentIncreaseDays * DAY_MS;

    // Exclude the current observation and invalid records.
    const previous = history
        .filter((observation) => {
            const timestamp = observation.observedAt.getTime();

            return (
                observation.id !== current.id &&
                Number.isFinite(timestamp) &&
                timestamp < currentTime &&
                timestamp >= ninetyDaysAgo &&
                Number.isFinite(observation.price) &&
                observation.price > 0
            );
        })
        .sort(
            (a, b) =>
                a.observedAt.getTime() -
                b.observedAt.getTime()
        );

    // Establish a baseline using regular prices from 31–90 days before the current observation.
    const baselineObservations = previous.filter(
        (observation) =>
            observation.observedAt.getTime() < thirtyDaysAgo &&
            isValidPrice(observation.regularPrice)
    );

    const baselinePrices = baselineObservations.map(
        (observation) => observation.regularPrice as number
    );

    const baselineSpan =
        baselineObservations.length > 1
            ? (
                baselineObservations[
                    baselineObservations.length - 1
                ].observedAt.getTime() -
                baselineObservations[0].observedAt.getTime()
            ) / DAY_MS
            : 0;

    const hasBaseline =
        baselinePrices.length >=
            CONFIG.minimumBaselineObservations &&
        baselineSpan >= CONFIG.minimumBaselineSpanDays;

    const historicalMedian = hasBaseline
        ? median(baselinePrices)
        : null;

    const activeSale = isOnSale(current);

    const currentRegular = current.regularPrice;
    const currentPromo = current.promoPrice;

    const observedDiscountPercent =
        activeSale &&
        currentRegular !== null &&
        currentPromo !== null
            ? (
                (currentRegular - currentPromo) /
                currentRegular
            ) * 100
            : null;


    // The current advertised regular price is substantially above the historical baseline.
    if (
        activeSale &&
        historicalMedian !== null &&
        currentRegular !== null
    ) {
        const referenceIncrease =
            (
                (currentRegular - historicalMedian) /
                historicalMedian
            ) * 100;

        if (
            referenceIncrease >=
            CONFIG.minimumIncreasePercent
        ) {
            reasons.push("INFLATED_REFERENCE_PRICE");
        }
    }


    // Look for a recent increase in the regular price relative to the older historical baseline.
    if (
        activeSale &&
        historicalMedian !== null &&
        currentRegular !== null
    ) {
        const recentObservations = previous.filter(
            (observation) =>
                observation.observedAt.getTime() >= thirtyDaysAgo &&
                isValidPrice(observation.regularPrice) &&
                !isOnSale(observation)
        );

        const recentInflation = recentObservations.some(
            (observation) => {
                const regular = observation.regularPrice!;

                const increasePercent =
                    (
                        (regular - historicalMedian) /
                        historicalMedian
                    ) * 100;

                // The observed increase must have occurred before the current promotion.
                return (
                    increasePercent >=
                        CONFIG.minimumIncreasePercent &&
                    regular >= currentRegular * 0.95
                );
            }
        );

        if (recentInflation) {
            reasons.push("PRE_SALE_INFLATION");
        }
    }


    // Determine whether the product was promoted for an unusually large share of observed days.
    const perpetualCutoff =
        currentTime - CONFIG.perpetualSaleDays * DAY_MS;

    const recentDays = new Map<string, PriceObservation>();

    for (const observation of [...previous, current]) {
        if (
            observation.observedAt.getTime() < perpetualCutoff
        ) {
            continue;
        }

        // One observation per UTC calendar day.
        const day = observation.observedAt
            .toISOString()
            .slice(0, 10);

        recentDays.set(day, observation);
    }

    const dailyObservations = [...recentDays.values()]
        .filter(
            (observation) =>
                isValidPrice(observation.regularPrice)
        );

    if (
        activeSale &&
        dailyObservations.length >=
            CONFIG.minimumPerpetualObservations
    ) {
        const saleDays = dailyObservations.filter(
            isOnSale
        ).length;

        const saleRatio =
            saleDays / dailyObservations.length;

        if (
            saleRatio >=
            CONFIG.perpetualSaleThreshold
        ) {
            reasons.push("PERPETUAL_SALE");
        }
    }

    return {
        anomalous: reasons.length > 0,
        reasons,
        historicalMedian,
        observedDiscountPercent,
    };
}
