export default defineStore(
  "setting",
  () => {
    const baseUrl = ref<string>("http://localhost:46000");
    const wsBaseUrl = ref<string>("ws://localhost:46000");

    if (baseUrl.value === "http://localhost:60000") {
      baseUrl.value = "http://localhost:46000";
    }
    if (wsBaseUrl.value === "ws://localhost:60000") {
      wsBaseUrl.value = "ws://localhost:46000";
    }

    const otherSetting = ref({
      axiosTimeOut: 60000 * 10 * 100,
      assetsBatchGenereateSize: 5,
    });

    const themeSetting = ref({
      mode: "light" as "light" | "dark" | "auto",
      primaryColor: "#9810fa",
    });

    return { baseUrl, wsBaseUrl, otherSetting, themeSetting };
  },
  { persist: true },
);
