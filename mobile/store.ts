export type KrogerStore = {
  locationId: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
};

export type StoreSearchSource = "zip" | "location";

export type SharedStoreSelection = {
  zip: string;
  setZip: (zip: string) => void;
  stores: KrogerStore[];
  setStores: (stores: KrogerStore[]) => void;
  selectedStoreId: string | null;
  setSelectedStoreId: (storeId: string | null) => void;
  searchSource: StoreSearchSource;
  setSearchSource: (source: StoreSearchSource) => void;
  storesChecked: boolean;
  setStoresChecked: (checked: boolean) => void;
};
