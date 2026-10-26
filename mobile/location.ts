import * as Location from "expo-location";
import { Alert, Linking, Platform } from "react-native";

type DeviceCoordinates = {
  latitude: number;
  longitude: number;
};

type DeviceLocationResult =
  | { granted: true; coordinates: DeviceCoordinates }
  | { granted: false; canAskAgain: boolean };

// Ask only when the user taps "Use my location." ZIP search still works if denied.
export async function requestDeviceCoordinates(): Promise<DeviceLocationResult> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    return { granted: false, canAskAgain: permission.canAskAgain };
  }

  if (!(await Location.hasServicesEnabledAsync())) {
    throw new Error("Location services are disabled.");
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  const { latitude, longitude } = position.coords;
  if (
    !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
  ) {
    throw new Error("The device returned invalid coordinates.");
  }

  return { granted: true, coordinates: { latitude, longitude } };
}

export function showLocationPermissionDenied(
  canAskAgain: boolean,
  setError: (message: string) => void
) {
  if (Platform.OS === "web") {
    // Browser permissions need to be changed in the browser's settings.
    setError("Location permission denied. Allow location in your browser settings or search by ZIP.");
    return;
  }
  setError(canAskAgain
    ? "Location permission denied. You can still search by ZIP."
    : "Location permission is off. You can still search by ZIP.");
  // If we can't ask again, help the user turn permission on in settings.
  if (canAskAgain) return;
  Alert.alert(
    "Location access is off",
    "Enable location access in your device settings, or search by ZIP instead.",
    [
      { text: "Use ZIP", style: "cancel" },
      {
        text: "Open Settings",
        onPress: () => {
          void Linking.openSettings().catch(() => {
            setError("Could not open device settings. You can still search by ZIP.");
          });
        },
      },
    ]
  );
}
