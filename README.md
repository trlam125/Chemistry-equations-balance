# Chemistry balance

Ứng dụng Android hỗ trợ cân bằng phương trình hóa học và trò chuyện với trợ lý hóa học.

## Tính năng chính

* Cân bằng phương trình hóa học thông thường và một số phương trình có chỉ số ký hiệu.
* Kiểm tra số nguyên tử ở hai vế.
* Hỗ trợ ngoặc và công thức chất ngậm nước.
* Lưu lịch sử phương trình trên thiết bị.
* Chatbot sử dụng Gemini khi có API key và tự chuyển sang chế độ ngoại tuyến khi cần.
* Nhận diện một số phản ứng phổ biến không thể xảy ra.

## Yêu cầu

* Android SDK 35
* JDK 17 trở lên
* Node.js nếu cần chạy bộ kiểm thử

## Build ứng dụng

```powershell
.\\gradlew.bat assembleDebug
```

APK sau khi build nằm tại:

```text
app\\build\\outputs\\apk\\debug\\app-debug.apk
```

## Gemini API key

Trong ứng dụng, mở phần cài đặt của chatbot và nhập API key được tạo tại Google AI Studio. Không nên đưa API key trực tiếp vào mã nguồn hoặc commit lên Git.

## APK thử nghiệm

APK có sẵn trong thư mục:

```text
dist/
```

