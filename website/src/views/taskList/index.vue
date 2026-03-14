<template>
  <div class="taskList">
    <div class="header">
      <h2 class="title">任务列表</h2>
    </div>
    <div class="search">
      <div>
        <span>项目名称：</span>
        <a-input placeholder="请输入项目名称" size="middle" />
      </div>
      <div>
        <span>任务名称：</span>
        <a-input placeholder="请输入任务名称" size="middle" />
      </div>
      <div>
        <span style="width: 50px">状态：</span>
        <a-input-group compact size="middle">
          <a-select style="width: 150px">
            <a-select-option value="inProgress">进行中</a-select-option>
            <a-select-option value="completed">已完成</a-select-option>
          </a-select>
        </a-input-group>
      </div>
      <a-button type="primary" style="margin-left: 50px">查询</a-button>
    </div>
    <div class="content">
      <vxe-table ref="tableRef" :data="taskItem">
        <vxe-column title="序号" field="id" width="70"></vxe-column>
        <vxe-column title="项目名称" field="projectName" width="120" show-overflow="title"></vxe-column>
        <vxe-column title="任务名称" field="taskName" show-overflow="title"></vxe-column>
        <vxe-column title="提示词" field="prompt" show-overflow="title"></vxe-column>
        <vxe-column title="状态" field="state" width="120"></vxe-column>
        <vxe-column title="开始时间" field="startTime" width="120"></vxe-column>
        <vxe-column title="结束时间" field="endTime" width="120"></vxe-column>
        <vxe-column title="操作" width="120">
          <template #default="{ row }">
            <a-button type="primary" @click="showModal(row)" size="small">查看</a-button>
          </template>
        </vxe-column>
      </vxe-table>
      <div class="pagination" style="margin-top: 10px; text-align: right">
        <a-pagination
          v-model:current="pageValue.page"
          v-model:pageSize="pageValue.limit"
          show-size-changer
          :total="pageValue.total"
          @showSizeChange="onShowSizeChange"
          @change="changeFn" />
      </div>
      <taskDetails v-model:open="open" :row="currentRow"></taskDetails>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { VxeTableInstance } from "vxe-table";
import taskDetails from "./components/taskDetails.vue";
interface taskData {
  id: number;
  projectName: string;
  taskName: string;
  state: string;
  startTime: string;
  endTime: string;
  prompt: string;
  imageUrl: string[];
  errorReason: string[];
}
const pageValue = ref({
  page: 1,
  limit: 10,
  total: 11,
  loading: false,
});
function onShowSizeChange(current: number, pageSize: number) {}
function changeFn(page: number, pageSize: number) {}
const taskItem = ref<taskData[]>([
  {
    id: 1,
    projectName: "项目1",
    taskName: "任务1",
    state: "进行中",
    startTime: "2022-01-01",
    endTime: "2022-01-31",
    prompt: "提示词",
    imageUrl: [
      "https://picx.zhimg.com/v2-d6f44389971daab7e688e5b37046e4e4_720w.jpg?source=172ae18b",
      "https://img.shetu66.com/2023/04/27/1682576769453692.png",
      "https://www.baidu.com/img/flexible/logo/pc/result.png",
    ],
    errorReason: ["任务失败"],
  },
  {
    id: 2,
    projectName: "项目2",
    taskName: "任务2",
    state: "已完成",
    startTime: "2022-02-01",
    endTime: "2022-02-28",
    prompt: "提示词",
    imageUrl: ["https://www.baidu.com/img/flexible/logo/pc/result.png"],
    errorReason: ["任务失败2"],
  },
]);

const open = ref<boolean>(false);
const currentRow = ref<any>(null);

const showModal = (row: taskData) => {
  currentRow.value = row;
  open.value = true;
};
</script>

<style lang="scss" scoped>
.taskList {
  width: 100%;
  margin: 0 auto;
  padding: 32px;
  background: transparent;
  .search {
    display: flex;
    align-items: center;
    margin-bottom: 35px;
    div {
      margin-right: 30px;
      display: flex;
      align-items: center;
      span {
        width: 100px;
        margin-right: 10px;
      }
    }
  }
  .header {
    margin-bottom: 2rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    .title {
      font-size: 2rem;
      font-weight: 600;
      color: #1a202c;
      margin-bottom: 0.5rem;
    }
  }
}
</style>
