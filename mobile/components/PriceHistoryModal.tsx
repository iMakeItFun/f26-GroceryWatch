import {useState} from "react";

import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View
} from "react-native";

import Svg, {
    Circle,
    G,
    Line,
    Path,
    Text as SvgText,
} from "react-native-svg";

import {colors} from "../theme";


export type PriceHistoryResponse = {
    listingId: string;
    trackingStartedAt: string;
    lastCheckedAt: string | null;
    refreshed: boolean;
    refreshError?: string;
    history: Array<{
        id: string;
        price: number;
        kind: "regular" | "promo";
        observedAt: string;
    }>;
};

type Props = {
    visible: boolean;
    productName: string;
    data: PriceHistoryResponse | null;
    loading: boolean;
    error: string;
    onClose: () => void;
};

type Period = "7D" | "30D" | "90D" | "ALL";

const PERIODS: Period[] = [
    "7D",
    "30D",
    "90D",
    "ALL"
];

const PERIOD_DAYS: Record<Exclude<Period, "ALL">, number> = {
    "7D": 7,
    "30D": 30,
    "90D": 90,
};

const CHART_HEIGHT = 230;

const LEFT = 50;
const RIGHT = 14;
const TOP = 20;
const BOTTOM = 35;





function money(price: number) {
    return `$${price.toFixed(2)}`;
}

function dateLabel(timestamp: number) {
    return new Date(timestamp).toLocaleDateString(undefined, {month: "short", day: "numeric"});
}

export function PriceHistoryModal({visible, productName, data, loading, error, onClose}: Props) {
    const [period, setPeriod] = useState<Period>("ALL");
    const [chartWidth, setChartWidth] = useState(310);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const cutoff = period == "ALL" ? -Infinity: Date.now() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000;

    const points = (data?.history ?? []).map((point) => ({
        ...point,
        timestamp: new Date(point.observedAt).getTime(),
    })).filter((point) => 
        Number.isFinite(point.timestamp) &&
        Number.isFinite(point.price) &&
        point.price >= 0 &&
        point.timestamp >= cutoff
    ).sort((a,b) => a.timestamp - b.timestamp);

    const hasPoints = points.length > 0;
    const latest = hasPoints ? points[points.length - 1]: null;
    const lowest = hasPoints ? Math.min(...points.map((p) => p.price)): null;
    const selected = points.find((p) => p.id === selectedId) ?? latest;

    const width = Math.max(180, chartWidth);
    const plotWidth = Math.max(1, width - LEFT - RIGHT);
    const plotHeight = CHART_HEIGHT - TOP - BOTTOM;

    const minTime = points[0]?.timestamp ?? 0;
    const maxTime = latest?.timestamp ?? minTime;
    const timeSpan = Math.max(1, maxTime - minTime);

    const minPrice = lowest ?? 0;
    const maxPrice = hasPoints ? Math.max(...points.map((p) => p.price)): 1;

    const padding = Math.max(0.25, (maxPrice - minPrice) * 0.15);
    const yMin = Math.max(0, minPrice - padding);
    const yMax = maxPrice + padding;

    function xOf(timestamp: number) {
        if (points.length == 1) {
            return LEFT + plotWidth / 2;
        }

        return (LEFT + ((timestamp - minTime) / timeSpan) * plotWidth);
    }

    function yOf(price: number) {
        return (TOP + ((yMax - price) / (yMax - yMin)) * plotHeight);
    }

    let path = "";

    if (hasPoints) {
        path = `M ${xOf(points[0].timestamp)} ${yOf(points[0].price)}`;

        for (let i = 1; i < points.length; i++) {
            const point = points[i];

            path += ` H ${xOf(point.timestamp)}`;
            path += ` V ${yOf(point.price)}`;
        }
    }

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={styles.panel}>
                    <ScrollView contentContainerStyle={styles.content}>

                        {/* Header */}
                        <View style = {styles.header}>
                            <View style={{flex: 1}}>
                                <Text style={styles.title}>
                                    Price History
                                </Text>

                                <Text style={styles.subtitle}>
                                    {productName}
                                </Text>
                            </View>

                            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close price history">
                                <Text style={styles.close}>
                                    Close
                                </Text>
                            </Pressable>
                        </View>

                        {loading ? (<ActivityIndicator size="large" color={colors.greenDark}/>):
                        error ? (<Text style={styles.error}>
                            {error}
                        </Text>):
                        !data ? (<Text style={styles.muted}>
                            No price history available
                        </Text>):
                        (<>
                            <View style={styles.summary}>
                                <View>
                                    <Text style={styles.muted}>
                                        Latest in range
                                    </Text>

                                    <Text style={styles.currentPrice}>
                                        {latest ? money(latest.price) : "-"}
                                    </Text>
                                </View>

                                <View>
                                    <Text style={styles.muted}>
                                        Lowest in range
                                    </Text>

                                    <Text style={styles.lowestPrice}>
                                        {lowest !== null ? money(lowest) : "-"}
                                    </Text>
                                </View>
                            </View>
                            <View style={styles.filters}>
                                {PERIODS.map((option) => {
                                    const active = option === period;

                                    return (
                                        <Pressable key={option} onPress={() => {
                                            setPeriod(option);
                                            setSelectedId(null);
                                        }}
                                        style = {[
                                            styles.filter,
                                            active && styles.filterActive,
                                        ]}
                                        >
                                            <Text style={[styles.filterText, active && styles.filterTextActive]}>
                                                {option}
                                            </Text>
                                        </Pressable>
                                    )
                                })}
                            </View>


                            {hasPoints ? (
                                <View onLayout={(event) => {
                                    setChartWidth(event.nativeEvent.layout.width);
                                }}
                            >
                                <Svg width={width} height={CHART_HEIGHT}>
                                    {[0,1,2,3].map((tick) => {
                                        const ratio = tick / 3;
                                        const y= TOP + ratio * plotHeight;
                                        const price = yMax-ratio * (yMax-yMin);

                                        return (
                                            <G key={tick}>
                                                <Line x1={LEFT} y1={y} x2={width-RIGHT} y2={y} stroke={colors.border} strokeWidth={1}/>
                                                
                                                <SvgText x={LEFT-7} y={y+4} textAnchor="end" fontSize={10} fill={colors.muted}>
                                                    {money(price)}
                                                </SvgText>
                                            </G>
                                        );
                                    })}

                                    <SvgText
                                        x={points.length === 1 ? LEFT + plotWidth / 2: LEFT}
                                        y={CHART_HEIGHT - 8}
                                        fontSize={11}
                                        textAnchor={points.length === 1 ? "middle": "start"}
                                        fill={colors.muted}
                                    >
                                        {dateLabel(minTime)}
                                    </SvgText>

                                    {points.length > 1 && (
                                        <SvgText
                                            x={width-RIGHT}
                                            y={CHART_HEIGHT-8}
                                            fontSize={11}
                                            textAnchor="end"
                                            fill={colors.muted}
                                        >
                                            {dateLabel(maxTime)}
                                        </SvgText>
                                    )}

                                    <Path
                                        d={path}
                                        stroke={colors.greenDark}
                                        strokeWidth={3}
                                        strokeLinejoin="round"
                                        fill="none"
                                    />

                                    {points.map((point) =>(
                                        <Circle
                                            key={point.id}
                                            cx={xOf(point.timestamp)}
                                            cy={yOf(point.price)}
                                            r={selected?.id === point.id ? 8 : 6}
                                            fill={point.kind === "promo" ? colors.warn : colors.greenDark}
                                            stroke={colors.white}
                                            strokeWidth={2}
                                            onPress={() => {
                                                setSelectedId(point.id);
                                            }}
                                        />
                                    ))}
                                </Svg>

                                {selected && (
                                    <View style={styles.tooltip}>
                                        <Text style={styles.tooltipPrice}>
                                            {money(selected.price)}
                                            {selected.kind === "promo" ? " . Promotion" : " . Regular"}
                                        </Text>

                                        <Text style={styles.muted}>
                                            Observed{" "}
                                            {new Date(selected.observedAt).toLocaleString()}
                                        </Text>
                                    </View>
                                )}
                            </View>
                            ) : (
                                <Text style={styles.muted}>
                                    No recorded price observations
                                    in this time period
                                </Text>
                            )}

                            <View style={styles.metadata}>
                                <Text style={styles.muted}>
                                    Tracking started:{" "}
                                    {new Date(data.trackingStartedAt).toLocaleString()}
                                </Text>

                                {data.lastCheckedAt && (
                                    <Text style = {styles.muted}>
                                        Last checked:{" "}
                                        {new Date(data.lastCheckedAt).toLocaleString()}
                                    </Text>
                                )}

                                {data.refreshError && (
                                    <Text style={styles.warning}>
                                        {data.refreshError}
                                    </Text>
                                )}
                            </View>
                        </>)}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    )
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "center",
        padding: 16
    },
    panel: {
        backgroundColor: colors.white,
        borderRadius: 18,
        padding: 16,
        width: "100%",
        maxWidth: 460,
        maxHeight: "85%",
        alignSelf: "center",
    },
    content: {
        gap: 16
    },
    header: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
    },
    title: {
        fontSize: 20,
        fontWeight: "700",
        color: colors.text,
    },
    subtitle: {
        marginTop: 3,
        color: colors.muted,
        fontSize: 13,
    },
    close: {
        color: colors.greenDark,
        fontSize: 15,
        fontWeight: "700",
    },
    summary: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 12,
    },
    currentPrice: {
        color: colors.greenDark,
        fontSize: 24,
        fontWeight: "800",
    },
    lowestPrice: {
        color: colors.text,
        fontSize: 24,
        fontWeight: "800",
    },
    muted: {
        fontSize: 12,
        color: colors.muted
    },
    filters: {
        flexDirection: "row",
        gap: 6,
    },
    filter: {
        flex: 1,
        paddingVertical: 10,
        backgroundColor: colors.card,
        borderRadius: 9,
        alignItems: "center",
    },
    filterActive: {
        backgroundColor: colors.greenDark,
    },
    filterText: {
        fontWeight: "700",
        color: colors.text,
    },
    filterTextActive: {
        color: colors.white,
    },
    tooltip: {
        padding: 12,
        gap: 4,
        borderRadius: 10,
        backgroundColor: colors.card,
    },
    tooltipPrice: {
        fontWeight: "700",
        color: colors.text,
        fontSize: 15
    },
    metadata: {
        gap: 6,
    },
    note: {
        fontSize: 11,
        color: colors.muted,
    },
    warning: {
        color: colors.warn,
        fontSize: 12,
    },
    error: {
        color: colors.danger,
    }
});