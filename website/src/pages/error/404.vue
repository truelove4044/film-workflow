<template>
  <div class="notFound">
    <i-search :size="56" class="notFoundIcon" />
    <div class="notFoundText">页面不存在</div>
    <a-button class="notFoundBtn" type="primary" @click="goHome">返回首页</a-button>
  </div>
</template>

<script setup lang="ts">
const router = useRouter();

function goHome() {
  router.push("/");
}
</script>

<style lang="scss" scoped>
.notFound {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  .notFoundIcon {
    margin-bottom: 32px;
    color: #d0d0d0;
  }
  .notFoundText {
    font-size: 24px;
    margin-bottom: 24px;
    font-weight: 500;
    color: #333;
  }
  .notFoundBtn {
    min-width: 120px;
  }
}
</style>
