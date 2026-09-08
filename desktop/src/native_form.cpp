#include "native_form.hpp"
#include <stdexcept>

namespace glab {
std::wstring toWide(const std::string& value) {
    if(value.empty()) return {};
    const auto size=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,value.data(),static_cast<int>(value.size()),nullptr,0);
    if(!size) throw std::runtime_error("Invalid UTF-8");
    std::wstring result(size,L'\0');
    MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,value.data(),static_cast<int>(value.size()),result.data(),size);
    return result;
}
std::string toUtf8(const std::wstring& value) {
    if(value.empty()) return {};
    const auto size=WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,value.data(),static_cast<int>(value.size()),nullptr,0,nullptr,nullptr);
    if(!size) throw std::runtime_error("Invalid UTF-16");
    std::string result(size,'\0');
    WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,value.data(),static_cast<int>(value.size()),result.data(),size,nullptr,nullptr);
    return result;
}
namespace {
struct FormState {
    std::wstring title;
    const std::vector<FormField>& fields;
    std::optional<Json> result;
};
INT_PTR CALLBACK formProc(HWND window, UINT message, WPARAM wparam, LPARAM lparam) {
    auto* state=reinterpret_cast<FormState*>(GetWindowLongPtrW(window,DWLP_USER));
    try {
        if(message==WM_INITDIALOG) {
            state=reinterpret_cast<FormState*>(lparam);
            SetWindowLongPtrW(window,DWLP_USER,lparam);
            SetWindowTextW(window,state->title.c_str());
            int top=14;
            for(std::size_t i=0;i<state->fields.size();++i) {
                const auto& field=state->fields[i];
                CreateWindowW(L"STATIC",toWide(field.label).c_str(),WS_CHILD|WS_VISIBLE,
                    14,top,510,22,window,nullptr,nullptr,nullptr);
                top+=24;
                const auto height=field.multiline ? 110 : 28;
                const auto style=WS_CHILD|WS_VISIBLE|WS_TABSTOP|WS_BORDER|
                    (field.multiline ? ES_MULTILINE|ES_AUTOVSCROLL|WS_VSCROLL : ES_AUTOHSCROLL);
                const auto edit=CreateWindowW(L"EDIT",toWide(field.value).c_str(),style,
                    14,top,510,height,window,reinterpret_cast<HMENU>(static_cast<INT_PTR>(100+i)),nullptr,nullptr);
                if(!edit) throw std::runtime_error("Cannot create input control");
                SendMessageW(edit,EM_LIMITTEXT,field.multiline ? 8000 : 1000,0);
                top+=height+14;
            }
            CreateWindowW(L"BUTTON",L"保存",WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_DEFPUSHBUTTON,
                300,top,100,32,window,reinterpret_cast<HMENU>(IDOK),nullptr,nullptr);
            CreateWindowW(L"BUTTON",L"取消",WS_CHILD|WS_VISIBLE|WS_TABSTOP,
                410,top,100,32,window,reinterpret_cast<HMENU>(IDCANCEL),nullptr,nullptr);
            RECT rect{0,0,540,top+50};
            AdjustWindowRectEx(&rect,static_cast<DWORD>(GetWindowLongPtrW(window,GWL_STYLE)),FALSE,0);
            SetWindowPos(window,nullptr,0,0,rect.right-rect.left,rect.bottom-rect.top,SWP_NOMOVE|SWP_NOZORDER);
            return TRUE;
        }
        if(message==WM_COMMAND && LOWORD(wparam)==IDOK && state) {
            Json body=Json::object();
            for(std::size_t i=0;i<state->fields.size();++i) {
                const auto input=GetDlgItem(window,static_cast<int>(100+i));
                std::wstring value(static_cast<std::size_t>(GetWindowTextLengthW(input))+1,L'\0');
                const auto size=GetWindowTextW(input,value.data(),static_cast<int>(value.size()));
                value.resize(size);
                body[state->fields[i].key]=toUtf8(value);
            }
            state->result=std::move(body); EndDialog(window,IDOK); return TRUE;
        }
        if(message==WM_CLOSE || (message==WM_COMMAND && LOWORD(wparam)==IDCANCEL)) {
            EndDialog(window,IDCANCEL); return TRUE;
        }
    } catch(...) {
        MessageBoxW(window,L"入力画面を処理できませんでした。",L"GLAB",MB_OK|MB_ICONERROR);
        EndDialog(window,IDCANCEL); return TRUE;
    }
    return FALSE;
}
}
std::optional<Json> editNativeForm(HWND parent, const std::string& title, const std::vector<FormField>& fields) {
    if(fields.empty() || fields.size()>8) throw std::invalid_argument("Invalid form fields");
    // DLGTEMPLATE の可変3フィールド (menu/class/title) は0。controlsは WM_INITDIALOG が所有。
    struct alignas(DWORD) Template { DLGTEMPLATE dialog; WORD menu{},windowClass{},title{}; } value{};
    value.dialog.style=WS_POPUP|WS_CAPTION|WS_SYSMENU|DS_MODALFRAME;
    value.dialog.cx=360; value.dialog.cy=220;
    FormState state{toWide(title),fields,{}};
    if(DialogBoxIndirectParamW(GetModuleHandleW(nullptr),&value.dialog,parent,formProc,reinterpret_cast<LPARAM>(&state))==-1)
        throw std::runtime_error("Cannot open native form");
    return state.result;
}
}
