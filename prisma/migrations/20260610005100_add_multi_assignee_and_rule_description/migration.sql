-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RoutingRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskType" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "defaultAssigneeId" TEXT NOT NULL,
    "coAssigneeIds" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "RoutingRule_defaultAssigneeId_fkey" FOREIGN KEY ("defaultAssigneeId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_RoutingRule" ("defaultAssigneeId", "id", "taskType") SELECT "defaultAssigneeId", "id", "taskType" FROM "RoutingRule";
DROP TABLE "RoutingRule";
ALTER TABLE "new_RoutingRule" RENAME TO "RoutingRule";
CREATE UNIQUE INDEX "RoutingRule_taskType_key" ON "RoutingRule"("taskType");
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emailId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "coAssigneeIds" TEXT NOT NULL DEFAULT '[]',
    "deadline" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "completedAt" DATETIME,
    "completionNote" TEXT,
    "completedByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Task_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "Email" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("assigneeId", "completedAt", "completionNote", "createdAt", "deadline", "description", "emailId", "id", "status", "taskType", "title") SELECT "assigneeId", "completedAt", "completionNote", "createdAt", "deadline", "description", "emailId", "id", "status", "taskType", "title" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
