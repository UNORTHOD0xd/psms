-- AddForeignKey
ALTER TABLE "placement" ADD CONSTRAINT "placement_student_user_id_fkey" FOREIGN KEY ("student_user_id") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

