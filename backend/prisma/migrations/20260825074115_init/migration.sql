-- CreateTable
CREATE TABLE `TravelPhoto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `fileName` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(80) NOT NULL,
    `imageData` LONGTEXT NOT NULL,
    `takenAt` DATETIME(3) NULL,
    `latitude` DECIMAL(10, 7) NULL,
    `longitude` DECIMAL(10, 7) NULL,
    `provinceCode` VARCHAR(8) NULL,
    `provinceName` VARCHAR(120) NULL,
    `placeName` VARCHAR(160) NULL,
    `caption` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TravelPhoto_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `TravelPhoto_provinceCode_idx`(`provinceCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TravelPhoto` ADD CONSTRAINT `TravelPhoto_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
