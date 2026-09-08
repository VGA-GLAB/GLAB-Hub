#include <glab/resident_host.hpp>
#include <glab/desktop_ui.hpp>
#include "native_form.hpp"
#include <tela/pictor_surface.hpp>
#include <windowsx.h>
#include <shellapi.h>
#include <memory>
#include <stdexcept>

namespace glab {
namespace {
constexpr wchar_t windowClass[]=L"GLAB.Tela.Resident";
constexpr UINT trayMessage=WM_APP+71;
constexpr UINT sessionInvalidatedMessage=WM_APP+72;
constexpr UINT showCommand=1, exitCommand=2;
constexpr UINT_PTR responseTimer=1;
class ResidentWindow {
public:
    ResidentWindow(HubBridge& bridge, const std::string& font)
        : bridge_(bridge),renderer_(font),ui_(bridge,[this](auto title,auto fields,auto complete) {
            auto result=editNativeForm(window_,title,fields);
            if(result) complete(std::move(*result));
          },[this](const auto& message) {
            return MessageBoxW(window_,toWide(message).c_str(),L"GLAB",MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2)==IDYES;
          }) {}
    ~ResidentWindow() {
        bridge_.setSessionInvalidationHandler({});
        if(tray_.hWnd) Shell_NotifyIconW(NIM_DELETE,&tray_);
        if(window_ && IsWindow(window_)) { KillTimer(window_,responseTimer); DestroyWindow(window_); }
        runtime_.disconnect();
    }
    int run() {
        WNDCLASSW cls{}; cls.lpfnWndProc=dispatch; cls.hInstance=GetModuleHandleW(nullptr);
        cls.lpszClassName=windowClass; cls.hCursor=LoadCursorW(nullptr,IDC_ARROW);
        cls.hIcon=LoadIconW(nullptr,IDI_APPLICATION);
        if(!RegisterClassW(&cls) && GetLastError()!=ERROR_CLASS_ALREADY_EXISTS) throw std::runtime_error("Cannot register window");
        window_=CreateWindowExW(0,windowClass,L"GLAB",WS_OVERLAPPEDWINDOW,
            CW_USEDEFAULT,CW_USEDEFAULT,960,1000,nullptr,nullptr,cls.hInstance,this);
        if(!window_) throw std::runtime_error("Cannot create GLAB window");
        bridge_.setSessionInvalidationHandler([window=window_] {
            PostMessageW(window,sessionInvalidatedMessage,0,0);
        });
        tray_.cbSize=sizeof(tray_); tray_.hWnd=window_; tray_.uID=1;
        tray_.uFlags=NIF_MESSAGE|NIF_ICON|NIF_TIP; tray_.uCallbackMessage=trayMessage;
        tray_.hIcon=cls.hIcon; wcscpy_s(tray_.szTip,L"GLAB — 開くにはクリック");
        if(!Shell_NotifyIconW(NIM_ADD,&tray_)) throw std::runtime_error("Cannot create tray icon");
        taskbarCreated_=RegisterWindowMessageW(L"TaskbarCreated");
        ShowWindow(window_,SW_SHOW); UpdateWindow(window_);
        MSG message{}; BOOL result;
        while((result=GetMessageW(&message,nullptr,0,0))>0) { TranslateMessage(&message); DispatchMessageW(&message); }
        return result==-1 ? 1 : static_cast<int>(message.wParam);
    }
private:
    static LRESULT CALLBACK dispatch(HWND window,UINT message,WPARAM wparam,LPARAM lparam) {
        auto* self=reinterpret_cast<ResidentWindow*>(GetWindowLongPtrW(window,GWLP_USERDATA));
        if(message==WM_NCCREATE) {
            self=static_cast<ResidentWindow*>(reinterpret_cast<CREATESTRUCTW*>(lparam)->lpCreateParams);
            self->window_=window; SetWindowLongPtrW(window,GWLP_USERDATA,reinterpret_cast<LONG_PTR>(self));
        }
        if(!self) return DefWindowProcW(window,message,wparam,lparam);
        try { return self->handle(message,wparam,lparam); }
        catch(...) {
            MessageBoxW(window,L"GLAB の表示を継続できません。アプリを終了します。",L"GLAB",MB_OK|MB_ICONERROR);
            PostQuitMessage(1); return 0;
        }
    }
    void viewport() {
        RECT rect{}; GetClientRect(window_,&rect);
        POINT point{}; ClientToScreen(window_,&point);
        const auto dpi=GetDpiForWindow(window_)/96.0f;
        const auto& before=runtime_.viewport();
        if(before.width!=rect.right || before.height!=rect.bottom || before.desktop_x!=point.x
            || before.desktop_y!=point.y || before.dpi_scale!=dpi) ++revision_;
        runtime_.viewport({"glab","main",revision_,point.x,point.y,
            rect.right,rect.bottom,dpi,IsWindowVisible(window_)!=FALSE,GetForegroundWindow()==window_});
    }
    void changed() {
        if(ui_.busy()) SetTimer(window_,responseTimer,100,nullptr);
        else KillTimer(window_,responseTimer);
        runtime_.invalidate(); InvalidateRect(window_,nullptr,FALSE);
    }
    void show() { ShowWindow(window_,SW_RESTORE); SetForegroundWindow(window_); changed(); }
    void paint() {
        PAINTSTRUCT paint{}; const auto dc=BeginPaint(window_,&paint);
        try {
            viewport(); runtime_.document(ui_.document());
            if(runtime_.viewport().width>0 && runtime_.viewport().height>0) {
                const auto pixels=renderer_.render(runtime_);
                BITMAPINFO bitmap{}; bitmap.bmiHeader.biSize=sizeof(BITMAPINFOHEADER);
                bitmap.bmiHeader.biWidth=pixels.width; bitmap.bmiHeader.biHeight=-pixels.height;
                bitmap.bmiHeader.biPlanes=1; bitmap.bmiHeader.biBitCount=32; bitmap.bmiHeader.biCompression=BI_RGB;
                SetDIBitsToDevice(dc,0,0,pixels.width,pixels.height,0,0,0,pixels.height,pixels.pixels.data(),&bitmap,DIB_RGB_COLORS);
                runtime_.frame_presented();
            }
        } catch(...) { EndPaint(window_,&paint); throw; }
        EndPaint(window_,&paint);
    }
    void pointer(UINT message,LPARAM lparam) {
        POINT point{GET_X_LPARAM(lparam),GET_Y_LPARAM(lparam)}; ClientToScreen(window_,&point);
        const auto down=message==WM_LBUTTONDOWN;
        if(down) { ++gesture_; SetCapture(window_); }
        const auto phase=down ? tela::PointerPhase::down : message==WM_LBUTTONUP ? tela::PointerPhase::up : tela::PointerPhase::move;
        runtime_.pointer({++sequence_,revision_,gesture_,phase,tela::PointerButton::primary,point.x,point.y},tela::InputSource::native);
        if(message==WM_LBUTTONUP) ReleaseCapture();
        if(runtime_.needs_frame() || message!=WM_MOUSEMOVE) changed();
    }
    LRESULT handle(UINT message,WPARAM wparam,LPARAM lparam) {
        if(taskbarCreated_ && message==taskbarCreated_) { Shell_NotifyIconW(NIM_ADD,&tray_); return 0; }
        switch(message) {
        case sessionInvalidatedMessage: ui_.sessionInvalidated(); changed(); return 0;
        case WM_PAINT: paint(); return 0;
        case WM_SIZE: case WM_MOVE: viewport(); changed(); return 0;
        case WM_DPICHANGED: {
            const auto* rect=reinterpret_cast<const RECT*>(lparam);
            SetWindowPos(window_,nullptr,rect->left,rect->top,rect->right-rect->left,rect->bottom-rect->top,SWP_NOZORDER);
            return 0;
        }
        case WM_LBUTTONDOWN: case WM_LBUTTONUP: case WM_MOUSEMOVE: pointer(message,lparam); return 0;
        case WM_SETFOCUS: viewport(); changed(); return 0;
        case WM_CAPTURECHANGED: case WM_KILLFOCUS: runtime_.cancel(); changed(); return 0;
        case WM_TIMER: if(wparam==responseTimer && ui_.poll()) changed(); return 0;
        case WM_CLOSE: ShowWindow(window_,SW_HIDE); runtime_.cancel(); return 0;
        case WM_COMMAND:
            if(LOWORD(wparam)==showCommand) show();
            if(LOWORD(wparam)==exitCommand) PostQuitMessage(0);
            return 0;
        case trayMessage:
            if(lparam==WM_LBUTTONUP || lparam==WM_LBUTTONDBLCLK) show();
            if(lparam==WM_RBUTTONUP) {
                const auto menu=CreatePopupMenu();
                if(!menu) throw std::runtime_error("Cannot create tray menu");
                AppendMenuW(menu,MF_STRING,showCommand,L"GLAB を開く");
                AppendMenuW(menu,MF_STRING,exitCommand,L"GLAB を終了");
                POINT point{}; GetCursorPos(&point); SetForegroundWindow(window_);
                TrackPopupMenu(menu,TPM_RIGHTBUTTON,point.x,point.y,0,window_,nullptr);
                DestroyMenu(menu);
            }
            return 0;
        }
        return DefWindowProcW(window_,message,wparam,lparam);
    }
    HWND window_{};
    HubBridge& bridge_;
    NOTIFYICONDATAW tray_{};
    UINT taskbarCreated_{};
    tela::Runtime runtime_;
    tela::PictorSurface renderer_;
    DesktopUi ui_;
    std::uint64_t revision_{},sequence_{},gesture_{};
};
}
int runResident(HubBridge& bridge,const std::string& font) {
    const auto mutex=CreateMutexW(nullptr,FALSE,L"Local\\GLAB.Tela.Resident");
    if(!mutex) throw std::runtime_error("Cannot create instance lock");
    struct CloseHandleOnExit { HANDLE handle; ~CloseHandleOnExit(){CloseHandle(handle);} } lock{mutex};
    if(GetLastError()==ERROR_ALREADY_EXISTS) {
        const auto window=FindWindowW(windowClass,nullptr);
        if(window) { ShowWindow(window,SW_RESTORE); SetForegroundWindow(window); }
        return 0;
    }
    ResidentWindow window(bridge,font);
    return window.run();
}
}
